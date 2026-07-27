import "server-only";

import type { ShiftStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import { getTorontoDayBounds } from "@/lib/finance/tips";
import {
  LABOR_COST_CRITICAL_THRESHOLD,
  LABOR_COST_TARGET_MAX,
  LABOR_COST_TARGET_MIN,
} from "@/lib/finance/labor-kpis-constants";
import { getCnesstWeekBounds as getCnesstWeekBoundsTz } from "@/lib/time/cnesst-week";
import { DEFAULT_LOCATION_TIMEZONE } from "@/lib/time/location-timezone";

const TORONTO_TZ = DEFAULT_LOCATION_TIMEZONE;

/** @deprecated import from labor-kpis-constants */
export { LABOR_COST_CRITICAL_THRESHOLD, LABOR_COST_TARGET_MAX, LABOR_COST_TARGET_MIN };

/** Semaine CNESST : au-delà, le temps supplémentaire (1.5x) s'applique. */
const CNESST_WEEKLY_HOURS_CAP = 40;
/** Seuil d'alerte "approche du 40h" avant même de l'atteindre. */
const OVERTIME_WATCH_THRESHOLD = 32;

const SCHEDULED_SHIFT_STATUSES: ShiftStatus[] = ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"];

export type LaborCostStatus = "good" | "warning" | "critical";

export type HourlyLaborBucket = {
  hour: number;
  projectedSales: number;
  /** Ventes réelles captées via webhook POS (Cluster) — `null` tant qu'aucune facture n'a fermé pour cette heure. */
  actualSales: number | null;
  laborHours: number;
  laborCost: number;
};

export type OvertimeRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type OvertimeRiskEmployee = {
  userId: string;
  fullName: string;
  weeklyHours: number;
  maxHoursPerWeek: number;
  riskLevel: OvertimeRiskLevel;
};

export type LaborVarianceEntry = {
  shiftId: string;
  employeeName: string;
  plannedHours: number;
  actualHours: number | null;
  varianceHours: number | null;
};

export type LaborVarianceReport = {
  entries: LaborVarianceEntry[];
  totalVarianceHours: number | null;
  hasPunchData: boolean;
};

export type LiveLaborKpiReport = {
  locationId: string;
  targetDate: string;
  isToday: boolean;
  currentHour: number;
  buckets: HourlyLaborBucket[];
  totalProjectedSales: number;
  totalLaborHours: number;
  totalLaborCost: number;
  fullDayLaborCostPercentage: number;
  liveLaborCostPercentage: number;
  liveLaborCostStatus: LaborCostStatus;
  dailySplh: number;
  currentHourSplh: number | null;
  overtimeRisk: OvertimeRiskEmployee[];
  laborVariance: LaborVarianceReport;
  hasSalesData: boolean;
  /** Vrai si au moins une tranche horaire provient du POS (Cluster) plutôt que de la projection. */
  hasPosData: boolean;
};

export async function calculateLiveLaborKpis(input: {
  locationId: string;
  targetDate: Date;
  /** Skip overtime scan — use for historical deltas / secondary KPI passes. */
  skipOvertimeRisk?: boolean;
}): Promise<LiveLaborKpiReport> {
  const { locationId, targetDate, skipOvertimeRisk = false } = input;

  const dayOfWeek = getDayOfWeekFromLocalDate(targetDate);
  const { dayStart, dayEnd } = getDayBoundsFromLocalDate(targetDate);
  const { distributionDate } = getTorontoDayBounds(targetDate);
  const isToday = isSameLocalDay(targetDate, new Date());
  const currentHour = getHourInToronto(new Date());

  const [shifts, projections, posSalesRows, overtimeRisk] = await Promise.all([
    prisma.shift.findMany({
      where: {
        locationId,
        startsAt: { gte: dayStart, lt: dayEnd },
        status: { in: SCHEDULED_SHIFT_STATUSES },
      },
      include: { employee: { include: { employeeProfile: true } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.hourlySalesProjection.findMany({
      where: { locationId, dayOfWeek },
    }),
    prisma.posSalesHourly.findMany({
      where: { locationId, date: distributionDate },
    }),
    skipOvertimeRisk
      ? Promise.resolve([] as Awaited<ReturnType<typeof calculateOvertimeRisk>>)
      : calculateOvertimeRisk(locationId, targetDate),
  ]);

  const projectionByHour = new Map(projections.map((row) => [row.hour, asPlainNumber(row.amount)]));
  const posSalesByHour = new Map(posSalesRows.map((row) => [row.hour, asPlainNumber(row.netSales)]));

  const buckets: HourlyLaborBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    projectedSales: projectionByHour.get(hour) ?? 0,
    actualSales: posSalesByHour.has(hour) ? posSalesByHour.get(hour)! : null,
    laborHours: 0,
    laborCost: 0,
  }));

  for (const shift of shifts) {
    const hourlyRate = asPlainNumber(shift.employee?.employeeProfile?.hourlyRate);
    if (!hourlyRate) continue;

    distributeShiftAcrossHours(shift.startsAt, shift.endsAt, shift.breakMinutes, (hour, hoursInBucket) => {
      const bucket = buckets[hour];
      bucket.laborHours += hoursInBucket;
      bucket.laborCost += hoursInBucket * hourlyRate;
    });
  }

  // Coalesce applicatif : les ventes réelles Cluster POS remplacent la
  // projection statique heure par heure dès qu'une facture a fermé.
  const effectiveSales = (bucket: HourlyLaborBucket) => bucket.actualSales ?? bucket.projectedSales;

  const totalProjectedSales = sum(buckets.map((b) => b.projectedSales));
  const totalSales = sum(buckets.map(effectiveSales));
  const totalLaborHours = sum(buckets.map((b) => b.laborHours));
  const totalLaborCost = sum(buckets.map((b) => b.laborCost));
  const hasPosData = posSalesRows.length > 0;
  const hasSalesData = projections.length > 0 || hasPosData;

  const fullDayLaborCostPercentage = laborCostPercentage(totalLaborCost, totalSales);

  const elapsedBuckets = isToday ? buckets.filter((b) => b.hour <= currentHour) : buckets;
  const elapsedSales = sum(elapsedBuckets.map(effectiveSales));
  const elapsedLaborCost = sum(elapsedBuckets.map((b) => b.laborCost));
  const liveLaborCostPercentage = laborCostPercentage(elapsedLaborCost, elapsedSales);

  const dailySplh = totalLaborHours > 0 ? round2(totalSales / totalLaborHours) : 0;
  const currentBucket = isToday ? buckets[currentHour] : null;
  const currentHourSplh =
    currentBucket && currentBucket.laborHours > 0
      ? round2(effectiveSales(currentBucket) / currentBucket.laborHours)
      : null;

  const laborVariance = calculateLaborVariance(shifts);

  return {
    locationId,
    targetDate: dayStart.toISOString(),
    isToday,
    currentHour,
    buckets,
    totalProjectedSales: round2(totalProjectedSales),
    totalLaborHours: round2(totalLaborHours),
    totalLaborCost: round2(totalLaborCost),
    fullDayLaborCostPercentage: round1(fullDayLaborCostPercentage),
    liveLaborCostPercentage: round1(liveLaborCostPercentage),
    liveLaborCostStatus: laborCostStatus(liveLaborCostPercentage),
    dailySplh,
    currentHourSplh,
    overtimeRisk,
    laborVariance,
    hasSalesData,
    hasPosData,
  };
}

export function laborCostStatus(percentage: number): LaborCostStatus {
  if (percentage >= LABOR_COST_CRITICAL_THRESHOLD) return "critical";
  if (percentage > LABOR_COST_TARGET_MAX) return "warning";
  return "good";
}

function laborCostPercentage(laborCost: number, sales: number): number {
  return sales > 0 ? (laborCost / sales) * 100 : 0;
}

/** Répartit les heures (nettes de pause) d'un quart sur les tranches horaires qu'il traverse. */
function distributeShiftAcrossHours(
  startsAt: Date,
  endsAt: Date,
  breakMinutes: number,
  onHour: (hour: number, hoursInBucket: number) => void,
) {
  const grossMs = endsAt.getTime() - startsAt.getTime();
  if (grossMs <= 0) return;

  const breakMs = breakMinutes * 60 * 1000;
  const netRatio = Math.max(grossMs - breakMs, 0) / grossMs;

  let cursor = new Date(startsAt);
  while (cursor < endsAt) {
    const hour = getHourInToronto(cursor);
    const nextHourBoundary = getNextHourBoundaryInToronto(cursor);
    const segmentEnd = nextHourBoundary < endsAt ? nextHourBoundary : endsAt;
    const segmentHours = ((segmentEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60)) * netRatio;

    onHour(hour, segmentHours);
    cursor = segmentEnd;
  }
}

async function calculateOvertimeRisk(locationId: string, targetDate: Date): Promise<OvertimeRiskEmployee[]> {
  const { weekStart, weekEnd } = getCnesstWeekBounds(targetDate);

  const weekShifts = await prisma.shift.findMany({
    where: {
      locationId,
      startsAt: { gte: weekStart, lt: weekEnd },
      status: { in: SCHEDULED_SHIFT_STATUSES },
      employeeId: { not: null },
    },
    include: { employee: { include: { employeeProfile: true } } },
  });

  const totals = new Map<string, { fullName: string; hours: number; maxHoursPerWeek: number }>();

  for (const shift of weekShifts) {
    if (!shift.employeeId || !shift.employee) continue;
    const hours = netShiftHours(shift.startsAt, shift.endsAt, shift.breakMinutes);
    const existing = totals.get(shift.employeeId);
    const maxHoursPerWeek = shift.employee.employeeProfile?.maxHoursPerWeek ?? CNESST_WEEKLY_HOURS_CAP;

    if (existing) {
      existing.hours += hours;
    } else {
      totals.set(shift.employeeId, { fullName: shift.employee.fullName, hours, maxHoursPerWeek });
    }
  }

  return [...totals.entries()]
    .map(([userId, entry]) => ({
      userId,
      fullName: entry.fullName,
      weeklyHours: round1(entry.hours),
      maxHoursPerWeek: entry.maxHoursPerWeek,
      riskLevel: overtimeRiskLevel(entry.hours, entry.maxHoursPerWeek),
    }))
    .filter((row) => row.riskLevel !== "LOW")
    .sort((a, b) => b.weeklyHours - a.weeklyHours);
}

function overtimeRiskLevel(weeklyHours: number, maxHoursPerWeek: number): OvertimeRiskLevel {
  if (weeklyHours >= maxHoursPerWeek) return "HIGH";
  if (weeklyHours >= OVERTIME_WATCH_THRESHOLD) return "MEDIUM";
  return "LOW";
}

function calculateLaborVariance(
  shifts: Array<{
    id: string;
    startsAt: Date;
    endsAt: Date;
    breakMinutes: number;
    actualStartsAt: Date | null;
    actualEndsAt: Date | null;
    employee: { fullName: string } | null;
  }>,
): LaborVarianceReport {
  const withPunch = shifts.filter((s) => s.actualStartsAt && s.actualEndsAt);

  const entries: LaborVarianceEntry[] = shifts.map((shift) => {
    const plannedHours = netShiftHours(shift.startsAt, shift.endsAt, shift.breakMinutes);
    const hasPunch = shift.actualStartsAt && shift.actualEndsAt;
    const actualHours = hasPunch
      ? netShiftHours(shift.actualStartsAt!, shift.actualEndsAt!, shift.breakMinutes)
      : null;

    return {
      shiftId: shift.id,
      employeeName: shift.employee?.fullName ?? "—",
      plannedHours: round2(plannedHours),
      actualHours: actualHours !== null ? round2(actualHours) : null,
      varianceHours: actualHours !== null ? round2(plannedHours - actualHours) : null,
    };
  });

  const hasPunchData = withPunch.length > 0;
  const totalVarianceHours = hasPunchData
    ? round2(sum(entries.map((e) => e.varianceHours ?? 0)))
    : null;

  return { entries, totalVarianceHours, hasPunchData };
}

function netShiftHours(startsAt: Date, endsAt: Date, breakMinutes: number): number {
  const grossHours = (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60);
  return Math.max(grossHours - breakMinutes / 60, 0);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getDayOfWeekFromLocalDate(date: Date): number {
  return date.getDay();
}

export function getDayBoundsFromLocalDate(date: Date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, dayEnd };
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** DST-safe CNESST week (Sunday→Sunday) in America/Toronto. */
export function getCnesstWeekBounds(date: Date) {
  return getCnesstWeekBoundsTz(date, TORONTO_TZ);
}

/**
 * Décalage (ms) entre l'heure murale de Toronto et UTC pour un instant donné —
 * recalculé à chaque appel pour rester correct de part et d'autre du DST.
 * `date + offset` interprété en UTC donne l'heure murale de Toronto. Utilisé
 * uniquement sur de vrais horodatages (quarts), jamais sur la date du sélecteur.
 */
function getTorontoOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** L'instant décalé pour que ses champs `getUTC*()` reflètent l'heure murale de Toronto. */
function toTorontoShifted(date: Date): Date {
  return new Date(date.getTime() + getTorontoOffsetMs(date));
}

export function getHourInToronto(date: Date): number {
  return toTorontoShifted(date).getUTCHours();
}

export function getNextHourBoundaryInToronto(date: Date): Date {
  const shifted = toTorontoShifted(date);
  const nextShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours() + 1,
    0,
    0,
    0,
  );
  return new Date(nextShifted - getTorontoOffsetMs(date));
}
