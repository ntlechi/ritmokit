import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type ArsiSyncSummary = {
  id: string;
  payloadSize: number;
  opsCount: number;
  createdCount: number;
  updatedCount: number;
  invalidatedCount: number;
  createdAt: string;
  importedByName: string;
};

type DataError = { ok: false; error: string };

export async function userCanImportArsi(userId: string, userRole: Role, organizationId: string): Promise<boolean> {
  if (!canAccessManagerSettings(userRole)) return false;
  if (userRole === "ADMIN" || userRole === "OWNER") {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    return !!org;
  }
  const membership = await prisma.locationMember.findFirst({
    where: { userId, location: { organizationId } },
  });
  return !!membership;
}

export async function getArsiHubContextForManager(input: {
  userId: string;
  userRole: Role;
}): Promise<
  | {
      ok: true;
      organizationId: string;
      organizationName: string;
      locationName: string;
      syncHistory: ArsiSyncSummary[];
    }
  | DataError
> {
  if (!canAccessManagerSettings(input.userRole)) return { ok: false, error: "unauthorized" };

  const membership = await prisma.locationMember.findFirst({
    where: { userId: input.userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: { include: { organization: true } } },
  });
  if (!membership) return { ok: false, error: "unauthorized" };

  const organizationId = membership.location.organizationId;

  const syncHistory = await prisma.arsiSyncLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { importedBy: { select: { fullName: true } } },
  });

  return {
    ok: true,
    organizationId,
    organizationName: membership.location.organization.name,
    locationName: membership.location.name,
    syncHistory: syncHistory.map((log) => ({
      id: log.id,
      payloadSize: log.payloadSize,
      opsCount: log.opsCount,
      createdCount: log.createdCount,
      updatedCount: log.updatedCount,
      invalidatedCount: log.invalidatedCount,
      createdAt: log.createdAt.toISOString(),
      importedByName: log.importedBy.fullName,
    })),
  };
}
