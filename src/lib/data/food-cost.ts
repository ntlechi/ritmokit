import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { calculateLiveLaborKpis } from "@/lib/finance/labor-kpis";
import { prisma } from "@/lib/prisma";

export type FoodCostSettings = {
  locationId: string;
  locationName: string;
  foodCostPct: number | null;
  foodCostUpdatedAt: string | null;
  laborCostPct: number | null;
  primeCostPct: number | null;
  posConnected: boolean;
  posProvider: string | null;
};

export async function getFoodCostSettings(
  userId: string,
  role: string,
): Promise<FoodCostSettings | null> {
  if (!canAccessManagerSettings(role as Parameters<typeof canAccessManagerSettings>[0])) {
    return null;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: {
        select: {
          id: true,
          name: true,
          foodCostPct: true,
          updatedAt: true,
          posIntegration: { select: { isActive: true, provider: true } },
        },
      },
    },
  });

  if (!membership) return null;

  const labor = await calculateLiveLaborKpis({
    locationId: membership.locationId,
    targetDate: new Date(),
  }).catch(() => null);

  const foodCostPct =
    membership.location.foodCostPct != null ? Number(membership.location.foodCostPct) : null;
  const laborCostPct =
    labor?.hasSalesData ? labor.liveLaborCostPercentage : null;
  const primeCostPct =
    foodCostPct != null && laborCostPct != null
      ? Math.round((foodCostPct + laborCostPct) * 10) / 10
      : null;

  return {
    locationId: membership.location.id,
    locationName: membership.location.name,
    foodCostPct,
    foodCostUpdatedAt: membership.location.updatedAt.toISOString(),
    laborCostPct,
    primeCostPct,
    posConnected: Boolean(membership.location.posIntegration?.isActive),
    posProvider: membership.location.posIntegration?.provider ?? null,
  };
}
