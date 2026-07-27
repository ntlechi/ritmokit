import "server-only";

import type { PayPeriodStatus, PayrollExportFormat, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { calculatePayrollForPeriod, type PayrollEmployeeLine, type PayrollWarning } from "@/lib/payroll/calculate";

export type PayPeriodSummary = {
  id: string;
  startDate: string;
  endDate: string;
  status: PayPeriodStatus;
  lockedAt: string | null;
  lockedByName: string | null;
  lineItemCount: number;
  exportCount: number;
  totalGrossPay: number;
};

export type PayrollExportSummary = {
  id: string;
  format: PayrollExportFormat;
  fileName: string;
  lineItemCount: number;
  exportedAt: string;
  exportedByName: string;
};

export type PayrollTotals = {
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  tipsAmount: number;
  grossPay: number;
};

export type PayPeriodDetail = {
  id: string;
  locationId: string;
  locationName: string;
  startDate: string;
  endDate: string;
  status: PayPeriodStatus;
  lockedAt: string | null;
  lockedByName: string | null;
  lines: PayrollEmployeeLine[];
  warnings: PayrollWarning[];
  exports: PayrollExportSummary[];
  totals: PayrollTotals;
};

type DataError = { ok: false; error: string };

async function getManagerLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumTotals(lines: PayrollEmployeeLine[]): PayrollTotals {
  return lines.reduce(
    (acc, line) => ({
      regularHours: round2(acc.regularHours + line.regularHours),
      overtimeHours: round2(acc.overtimeHours + line.overtimeHours),
      regularPay: round2(acc.regularPay + line.regularPay),
      overtimePay: round2(acc.overtimePay + line.overtimePay),
      tipsAmount: round2(acc.tipsAmount + line.tipsAmount),
      grossPay: round2(acc.grossPay + line.grossPay),
    }),
    { regularHours: 0, overtimeHours: 0, regularPay: 0, overtimePay: 0, tipsAmount: 0, grossPay: 0 },
  );
}

export async function getPayPeriodsForManager(input: {
  userId: string;
  userRole: Role;
}): Promise<{ ok: true; locationId: string; periods: PayPeriodSummary[] } | DataError> {
  if (!canAccessManagerSettings(input.userRole)) return { ok: false, error: "unauthorized" };

  const membership = await getManagerLocation(input.userId);
  if (!membership) return { ok: false, error: "unauthorized" };

  const periods = await prisma.payPeriod.findMany({
    where: { locationId: membership.locationId },
    orderBy: { startDate: "desc" },
    include: {
      lockedBy: { select: { fullName: true } },
      lineItems: { select: { grossPay: true } },
      exports: { select: { id: true } },
    },
  });

  return {
    ok: true,
    locationId: membership.locationId,
    periods: periods.map((period) => ({
      id: period.id,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
      status: period.status,
      lockedAt: period.lockedAt?.toISOString() ?? null,
      lockedByName: period.lockedBy?.fullName ?? null,
      lineItemCount: period.lineItems.length,
      exportCount: period.exports.length,
      totalGrossPay: round2(period.lineItems.reduce((sum, li) => sum + asPlainNumber(li.grossPay), 0)),
    })),
  };
}

export async function getPayPeriodDetailForManager(input: {
  userId: string;
  userRole: Role;
  payPeriodId: string;
}): Promise<{ ok: true; detail: PayPeriodDetail } | DataError> {
  if (!canAccessManagerSettings(input.userRole)) return { ok: false, error: "unauthorized" };

  const membership = await getManagerLocation(input.userId);
  if (!membership) return { ok: false, error: "unauthorized" };

  const period = await prisma.payPeriod.findFirst({
    where: { id: input.payPeriodId, locationId: membership.locationId },
    include: {
      lockedBy: { select: { fullName: true } },
      lineItems: { include: { user: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
      exports: { orderBy: { exportedAt: "desc" }, include: { exportedBy: { select: { fullName: true } } } },
    },
  });
  if (!period) return { ok: false, error: "not_found" };

  let lines: PayrollEmployeeLine[];
  let warnings: PayrollWarning[] = [];

  if (period.status === "LOCKED") {
    lines = period.lineItems
      .map((li) => ({
        userId: li.userId,
        fullName: li.user.fullName,
        payrollEmployeeCode: li.payrollEmployeeCode,
        stationId: li.stationId,
        stationNameFr: li.stationNameFr,
        hourlyRate: asPlainNumber(li.hourlyRate),
        regularHours: asPlainNumber(li.regularHours),
        overtimeHours: asPlainNumber(li.overtimeHours),
        regularPay: asPlainNumber(li.regularPay),
        overtimePay: asPlainNumber(li.overtimePay),
        tipsAmount: asPlainNumber(li.tipsAmount),
        grossPay: asPlainNumber(li.grossPay),
        shiftCount: li.shiftCount,
        incompletePunchCount: li.incompletePunchCount,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "fr-CA"));
  } else {
    const calc = await calculatePayrollForPeriod({
      locationId: membership.locationId,
      startDate: period.startDate,
      endDate: period.endDate,
    });
    if (!calc.ok) return { ok: false, error: calc.error };
    lines = calc.result.lines;
    warnings = calc.result.warnings;
  }

  return {
    ok: true,
    detail: {
      id: period.id,
      locationId: period.locationId,
      locationName: membership.location.name,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
      status: period.status,
      lockedAt: period.lockedAt?.toISOString() ?? null,
      lockedByName: period.lockedBy?.fullName ?? null,
      lines,
      warnings,
      exports: period.exports.map((exp) => ({
        id: exp.id,
        format: exp.format,
        fileName: exp.fileName,
        lineItemCount: exp.lineItemCount,
        exportedAt: exp.exportedAt.toISOString(),
        exportedByName: exp.exportedBy.fullName,
      })),
      totals: sumTotals(lines),
    },
  };
}
