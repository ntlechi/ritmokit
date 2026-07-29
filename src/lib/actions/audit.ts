"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { parseBusinessDateInput } from "@/lib/finance/business-date";
import { compileAuditPackage } from "@/lib/audit/compile";
import type { AuditType } from "@/generated/prisma/enums";

const AUDIT_PATH = "/[lang]/settings/manager/audit";

export type GenerateAuditPackageResult =
  | { ok: true; auditPackageLogId: string; fileName: string; hash: string; recordCount: number }
  | { ok: false; error: string };

async function requireManagerLocation(userId: string, userRole: string) {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  return { ok: true as const, membership };
}

export async function generateAuditPackageAction(
  type: AuditType,
  startDateValue: string,
  endDateValue: string,
): Promise<GenerateAuditPackageResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const access = await requireManagerLocation(user.id, user.role);
    if (!access.ok) return { ok: false, error: access.error };

    const startDate = parseBusinessDateInput(startDateValue);
    const endDate = parseBusinessDateInput(endDateValue);
    if (!startDate || !endDate) return { ok: false, error: "invalid_date" };
    if (endDate.getTime() < startDate.getTime()) return { ok: false, error: "invalid_range" };

    const locationId = access.membership.locationId;

    const compiled = await compileAuditPackage({
      locationId,
      userId: user.id,
      type,
      startDate,
      endDate,
    });

    const created = await prisma.auditPackageLog.create({
      data: {
        locationId,
        generatedById: user.id,
        type,
        startDate,
        endDate,
        fileName: compiled.fileName,
        packageData: new Uint8Array(compiled.zipBuffer),
        packageHash: compiled.manifestHash,
        recordCount: compiled.recordCount,
      },
    });

    revalidatePath(AUDIT_PATH, "page");
    return {
      ok: true,
      auditPackageLogId: created.id,
      fileName: compiled.fileName,
      hash: compiled.manifestHash,
      recordCount: compiled.recordCount,
    };
  } catch (error) {
    return actionDatabaseError("audit", error);
  }
}
