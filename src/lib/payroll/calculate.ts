import "server-only";

import type { ShiftStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import { calculatePunchedWorkedHours, getTorontoDayBounds } from "@/lib/finance/business-date";

/** Seuil hebdomadaire CNESST (LNT art. 52) au-delà duquel le 1.5x s'applique. */
const CNESST_WEEKLY_HOURS_CAP = 40;
const OVERTIME_MULTIPLIER = 1.5;

/** Quarts considérés "actifs" pour la paie — un brouillon ou un quart rejeté
 * n'a jamais pu être travaillé. */
const PAYROLL_ELIGIBLE_STATUSES: ShiftStatus[] = [
  "PUBLISHED",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "CRISIS_ALERT",
];

export type PayrollWarning =
  | { type: "missing_punch"; userId: string; fullName: string; shiftId: string; shiftDate: string }
  | { type: "missing_hourly_rate"; userId: string; fullName: string };

export type PayrollEmployeeLine = {
  userId: string;
  fullName: string;
  payrollEmployeeCode: string | null;
  stationId: string;
  stationNameFr: string;
  hourlyRate: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  shiftCount: number;
  incompletePunchCount: number;
};

export type PayrollCalculation = {
  lines: PayrollEmployeeLine[];
  warnings: PayrollWarning[];
  weekCount: number;
};

export type ValidatePayPeriodResult = { ok: true; weekCount: number } | { ok: false; error: string };

/**
 * Une période de paie doit débuter un dimanche et couvrir un nombre entier
 * de semaines CNESST (dimanche → samedi). Sinon, une semaine serait coupée
 * en deux périodes distinctes et le seuil des 40h hebdomadaires (temps
 * supplémentaire) serait calculé sur une fraction de semaine — faussant le
 * montant légalement dû à l'employé.
 */
export function validatePayPeriodBounds(startDate: Date, endDate: Date): ValidatePayPeriodResult {
  const { distributionDate: start } = getTorontoDayBounds(startDate);
  const { distributionDate: end } = getTorontoDayBounds(endDate);

  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: "invalid_range" };
  }
  if (start.getUTCDay() !== 0) {
    return { ok: false, error: "must_start_sunday" };
  }

  const spanDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (spanDays % 7 !== 0) {
    return { ok: false, error: "must_span_full_weeks" };
  }

  return { ok: true, weekCount: spanDays / 7 };
}

function addCalendarDays(distributionDate: Date, days: number): Date {
  const shifted = new Date(distributionDate);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

/** Découpe la période en semaines CNESST réelles (dimanche 00:00 → dimanche
 * suivant 00:00, heure de Toronto) — recalculées jour par jour pour rester
 * exactes de part et d'autre d'un changement d'heure (DST). */
function getCnesstWeeksInPeriod(startDate: Date, weekCount: number): { weekStart: Date; weekEnd: Date }[] {
  const { distributionDate: periodStartDistDate } = getTorontoDayBounds(startDate);

  return Array.from({ length: weekCount }, (_, i) => {
    const weekStartDistDate = addCalendarDays(periodStartDistDate, i * 7);
    const weekEndDistDate = addCalendarDays(periodStartDistDate, i * 7 + 6);
    const { dayStart: weekStart } = getTorontoDayBounds(weekStartDistDate);
    const { dayEnd: weekEnd } = getTorontoDayBounds(weekEndDistDate);
    return { weekStart, weekEnd };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type PayrollShiftRow = {
  id: string;
  stationId: string;
  station: { nameFr: string };
  startsAt: Date;
  status: ShiftStatus;
  actualStartsAt: Date | null;
  actualEndsAt: Date | null;
  breakStartedAt: Date | null;
  breakEndedAt: Date | null;
  breakMinutes: number;
  employeeId: string | null;
  employee: {
    id: string;
    fullName: string;
    employeeProfile: { hourlyRate: unknown } | null;
    hrProfile: { payrollEmployeeCode: string | null } | null;
    locationMembers: Array<{ stationId: string; station: { nameFr: string } }>;
  } | null;
};

/**
 * Calcule la paie d'une succursale pour une période — heures régulières et
 * supplémentaires par employé (calculées semaine CNESST par semaine CNESST,
 * jamais sur la période complète).
 *
 * N'utilise QUE les pointages réels (`actualStartsAt`/`actualEndsAt`) comme
 * source de vérité des heures — jamais l'horaire planifié — pour garantir
 * que le fichier envoyé au fournisseur de paie reflète ce qui a réellement
 * été travaillé.
 */
export async function calculatePayrollForPeriod(input: {
  locationId: string;
  startDate: Date;
  endDate: Date;
}): Promise<{ ok: true; result: PayrollCalculation } | { ok: false; error: string }> {
  const validation = validatePayPeriodBounds(input.startDate, input.endDate);
  if (!validation.ok) return { ok: false, error: validation.error };

  const { weekCount } = validation;
  const weeks = getCnesstWeeksInPeriod(input.startDate, weekCount);
  const periodStart = weeks[0].weekStart;
  const periodEnd = weeks[weeks.length - 1].weekEnd;

  const shifts = (await prisma.shift.findMany({
    where: {
      locationId: input.locationId,
      employeeId: { not: null },
      status: { in: PAYROLL_ELIGIBLE_STATUSES },
      startsAt: { gte: periodStart, lt: periodEnd },
    },
    include: {
      station: { select: { nameFr: true } },
      employee: {
        include: {
          employeeProfile: true,
          hrProfile: { select: { payrollEmployeeCode: true } },
          locationMembers: {
            where: { locationId: input.locationId },
            take: 1,
            select: { stationId: true, station: { select: { nameFr: true } } },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  })) as unknown as PayrollShiftRow[];

  const warnings: PayrollWarning[] = [];

  type EmployeeAccumulator = {
    userId: string;
    fullName: string;
    payrollEmployeeCode: string | null;
    stationId: string;
    stationNameFr: string;
    hourlyRate: number;
    weeklyHours: number[];
    shiftCount: number;
    incompletePunchCount: number;
  };

  const employees = new Map<string, EmployeeAccumulator>();

  function getWeekIndex(startsAt: Date): number {
    return weeks.findIndex((week) => startsAt >= week.weekStart && startsAt < week.weekEnd);
  }

  for (const shift of shifts) {
    if (!shift.employeeId || !shift.employee) continue;

    let accumulator = employees.get(shift.employeeId);
    if (!accumulator) {
      const hourlyRate = shift.employee.employeeProfile
        ? asPlainNumber(shift.employee.employeeProfile.hourlyRate)
        : 0;
      if (!shift.employee.employeeProfile) {
        warnings.push({
          type: "missing_hourly_rate",
          userId: shift.employeeId,
          fullName: shift.employee.fullName,
        });
      }
      const membership = shift.employee.locationMembers[0];
      accumulator = {
        userId: shift.employeeId,
        fullName: shift.employee.fullName,
        payrollEmployeeCode: shift.employee.hrProfile?.payrollEmployeeCode ?? null,
        stationId: membership?.stationId ?? shift.stationId,
        stationNameFr: membership?.station.nameFr ?? "Station",
        hourlyRate,
        weeklyHours: new Array(weekCount).fill(0),
        shiftCount: 0,
        incompletePunchCount: 0,
      };
      employees.set(shift.employeeId, accumulator);
    }

    if (!shift.actualStartsAt || !shift.actualEndsAt) {
      accumulator.incompletePunchCount += 1;
      warnings.push({
        type: "missing_punch",
        userId: shift.employeeId,
        fullName: shift.employee.fullName,
        shiftId: shift.id,
        shiftDate: shift.startsAt.toISOString(),
      });
      continue;
    }

    const weekIndex = getWeekIndex(shift.startsAt);
    if (weekIndex === -1) continue;

    const workedHours = calculatePunchedWorkedHours(shift);
    accumulator.weeklyHours[weekIndex] += workedHours;
    accumulator.shiftCount += 1;
  }

  const lines: PayrollEmployeeLine[] = [...employees.values()]
    .map((employee) => {
      let regularHours = 0;
      let overtimeHours = 0;

      for (const hoursThisWeek of employee.weeklyHours) {
        regularHours += Math.min(hoursThisWeek, CNESST_WEEKLY_HOURS_CAP);
        overtimeHours += Math.max(hoursThisWeek - CNESST_WEEKLY_HOURS_CAP, 0);
      }

      const regularPay = regularHours * employee.hourlyRate;
      const overtimePay = overtimeHours * employee.hourlyRate * OVERTIME_MULTIPLIER;

      return {
        userId: employee.userId,
        fullName: employee.fullName,
        payrollEmployeeCode: employee.payrollEmployeeCode,
        stationId: employee.stationId,
        stationNameFr: employee.stationNameFr,
        hourlyRate: round2(employee.hourlyRate),
        regularHours: round2(regularHours),
        overtimeHours: round2(overtimeHours),
        regularPay: round2(regularPay),
        overtimePay: round2(overtimePay),
        grossPay: round2(regularPay + overtimePay),
        shiftCount: employee.shiftCount,
        incompletePunchCount: employee.incompletePunchCount,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "fr-CA"));

  return { ok: true, result: { lines, warnings, weekCount } };
}
