import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { calculateLiveLaborKpis, type LiveLaborKpiReport } from "@/lib/finance/labor-kpis";
import { prisma } from "@/lib/prisma";

export type LaborKpiResult =
  | { ok: true; data: LiveLaborKpiReport }
  | { ok: false; error: "unauthorized" };

/** Le coût de main-d'œuvre expose les taux horaires — réservé aux gérants/propriétaires. */
export async function getLiveLaborKpisForUser(
  userId: string,
  userRole: string,
  targetDate: Date,
): Promise<LaborKpiResult> {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  if (!membership) {
    return { ok: false, error: "unauthorized" };
  }

  const data = await calculateLiveLaborKpis({ locationId: membership.locationId, targetDate });
  return { ok: true, data };
}
