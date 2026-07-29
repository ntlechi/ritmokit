"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { parseBusinessDateInput } from "@/lib/finance/business-date";
import { asPlainNumber } from "@/lib/data/serialize";
import { calculatePayrollForPeriod, validatePayPeriodBounds, type PayrollWarning } from "@/lib/payroll/calculate";
import { generateNethrisCsv } from "@/lib/payroll/connectors/nethris";
import { generatePayworksCsv } from "@/lib/payroll/connectors/payworks";
import type { PayrollExportFormat } from "@/generated/prisma/enums";

const PAYROLL_PATH = "/[lang]/settings/manager/payroll";

export type CreatePayPeriodResult = { ok: true; payPeriodId: string } | { ok: false; error: string };
export type LockPayPeriodResult =
  | { ok: true }
  | { ok: false; error: "has_warnings"; warnings: PayrollWarning[] }
  | { ok: false; error: string };
export type DeletePayPeriodResult = { ok: true } | { ok: false; error: string };
export type GenerateExportResult = { ok: true; exportId: string; fileName: string } | { ok: false; error: string };

async function requireManagerLocation(userId: string, userRole: string) {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  return { ok: true as const, membership };
}

export async function createPayPeriodAction(
  startDateValue: string,
  endDateValue: string,
): Promise<CreatePayPeriodResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const access = await requireManagerLocation(user.id, user.role);
    if (!access.ok) return { ok: false, error: access.error };

    const startDate = parseBusinessDateInput(startDateValue);
    const endDate = parseBusinessDateInput(endDateValue);
    if (!startDate || !endDate) return { ok: false, error: "invalid_date" };

    const validation = validatePayPeriodBounds(startDate, endDate);
    if (!validation.ok) return { ok: false, error: validation.error };

    const locationId = access.membership.locationId;

    const overlapping = await prisma.payPeriod.findFirst({
      where: {
        locationId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) return { ok: false, error: "overlapping_period" };

    const created = await prisma.payPeriod.create({
      data: { locationId, startDate, endDate },
    });

    revalidatePath(PAYROLL_PATH, "page");
    return { ok: true, payPeriodId: created.id };
  } catch (error) {
    return actionDatabaseError("payroll", error);
  }
}

export async function lockPayPeriodAction(payPeriodId: string): Promise<LockPayPeriodResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const access = await requireManagerLocation(user.id, user.role);
    if (!access.ok) return { ok: false, error: access.error };

    const period = await prisma.payPeriod.findFirst({
      where: { id: payPeriodId, locationId: access.membership.locationId },
    });
    if (!period) return { ok: false, error: "not_found" };
    if (period.status === "LOCKED") return { ok: false, error: "already_locked" };

    const calc = await calculatePayrollForPeriod({
      locationId: access.membership.locationId,
      startDate: period.startDate,
      endDate: period.endDate,
    });
    if (!calc.ok) return { ok: false, error: calc.error };
    if (calc.result.warnings.length > 0) {
      return { ok: false, error: "has_warnings", warnings: calc.result.warnings };
    }
    if (calc.result.lines.length === 0) {
      return { ok: false, error: "no_data" };
    }

    await prisma.$transaction([
      prisma.payrollLineItem.createMany({
        data: calc.result.lines.map((line) => ({
          payPeriodId: period.id,
          userId: line.userId,
          payrollEmployeeCode: line.payrollEmployeeCode,
          stationId: line.stationId,
          stationNameFr: line.stationNameFr,
          hourlyRate: line.hourlyRate,
          regularHours: line.regularHours,
          overtimeHours: line.overtimeHours,
          regularPay: line.regularPay,
          overtimePay: line.overtimePay,
          grossPay: line.grossPay,
          shiftCount: line.shiftCount,
          incompletePunchCount: line.incompletePunchCount,
        })),
      }),
      prisma.payPeriod.update({
        where: { id: period.id },
        data: { status: "LOCKED", lockedById: user.id, lockedAt: new Date() },
      }),
    ]);

    revalidatePath(PAYROLL_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("payroll", error);
  }
}

export async function deleteOpenPayPeriodAction(payPeriodId: string): Promise<DeletePayPeriodResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const access = await requireManagerLocation(user.id, user.role);
    if (!access.ok) return { ok: false, error: access.error };

    const period = await prisma.payPeriod.findFirst({
      where: { id: payPeriodId, locationId: access.membership.locationId },
    });
    if (!period) return { ok: false, error: "not_found" };
    // Une période verrouillée ne peut jamais être supprimée — c'est la garantie
    // d'immuabilité de l'audit trail de paie.
    if (period.status === "LOCKED") return { ok: false, error: "cannot_delete_locked" };

    await prisma.payPeriod.delete({ where: { id: period.id } });

    revalidatePath(PAYROLL_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("payroll", error);
  }
}

export async function generatePayrollExportAction(
  payPeriodId: string,
  format: PayrollExportFormat,
): Promise<GenerateExportResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const access = await requireManagerLocation(user.id, user.role);
    if (!access.ok) return { ok: false, error: access.error };

    const period = await prisma.payPeriod.findFirst({
      where: { id: payPeriodId, locationId: access.membership.locationId },
      include: { lineItems: { include: { user: { select: { fullName: true } } } }, location: true },
    });
    if (!period) return { ok: false, error: "not_found" };
    if (period.status !== "LOCKED") return { ok: false, error: "period_not_locked" };
    if (period.lineItems.length === 0) return { ok: false, error: "no_data" };

    const lines = period.lineItems.map((li) => ({
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
      grossPay: asPlainNumber(li.grossPay),
      shiftCount: li.shiftCount,
      incompletePunchCount: li.incompletePunchCount,
    }));

    const csvContent = format === "NETHRIS" ? generateNethrisCsv(lines, period.endDate) : generatePayworksCsv(lines, period.endDate);

    const startLabel = period.startDate.toISOString().slice(0, 10);
    const endLabel = period.endDate.toISOString().slice(0, 10);
    const fileName = `${format.toLowerCase()}_${period.location.slug}_${startLabel}_${endLabel}.csv`;

    const created = await prisma.payrollExport.create({
      data: {
        payPeriodId: period.id,
        format,
        fileName,
        csvContent,
        lineItemCount: lines.length,
        exportedById: user.id,
      },
    });

    revalidatePath(PAYROLL_PATH, "page");
    return { ok: true, exportId: created.id, fileName };
  } catch (error) {
    return actionDatabaseError("payroll", error);
  }
}
