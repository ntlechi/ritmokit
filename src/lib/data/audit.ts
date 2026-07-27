import "server-only";

import type { AuditType, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { canAccessManagerSettings } from "@/lib/auth/session";

export type AuditPackageSummary = {
  id: string;
  type: AuditType;
  startDate: string;
  endDate: string;
  fileName: string;
  packageHash: string;
  recordCount: number;
  createdAt: string;
  generatedByName: string;
};

type DataError = { ok: false; error: string };

async function getManagerLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
}

export async function getAuditPackageHistoryForManager(input: {
  userId: string;
  userRole: Role;
}): Promise<{ ok: true; locationId: string; locationName: string; packages: AuditPackageSummary[] } | DataError> {
  if (!canAccessManagerSettings(input.userRole)) return { ok: false, error: "unauthorized" };

  const membership = await getManagerLocation(input.userId);
  if (!membership) return { ok: false, error: "unauthorized" };

  const packages = await prisma.auditPackageLog.findMany({
    where: { locationId: membership.locationId },
    orderBy: { createdAt: "desc" },
    include: { generatedBy: { select: { fullName: true } } },
  });

  return {
    ok: true,
    locationId: membership.locationId,
    locationName: membership.location.name,
    packages: packages.map((p) => ({
      id: p.id,
      type: p.type,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate.toISOString(),
      fileName: p.fileName,
      packageHash: p.packageHash,
      recordCount: p.recordCount,
      createdAt: p.createdAt.toISOString(),
      generatedByName: p.generatedBy.fullName,
    })),
  };
}
