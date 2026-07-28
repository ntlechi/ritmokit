import "server-only";

import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { loadDanceAnalyticsForLocation } from "@/lib/dance/analytics";
import type { DanceAnalyticsBundle } from "@/lib/dance/analytics";
import { computeLocationKpiSnapshot } from "@/lib/kpi/compute";
import type { LocationKpiSnapshot } from "@/lib/kpi/types";
import type { Role } from "@/generated/prisma/enums";

export type StudioCockpitData = {
  locationId: string;
  locationName: string;
  analytics: DanceAnalyticsBundle;
  kpiSnapshot: LocationKpiSnapshot;
  generatedAt: string;
};

export async function getStudioCockpitData(
  userId: string,
  role: Role,
): Promise<StudioCockpitData | null> {
  if (!canAccessManagerSettings(role)) return null;

  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const locationId = membership.locationId;
  const now = new Date();

  const [analytics, kpiSnapshot] = await Promise.all([
    loadDanceAnalyticsForLocation(locationId),
    computeLocationKpiSnapshot(locationId, now),
  ]);

  return {
    locationId,
    locationName: membership.location.name,
    analytics,
    kpiSnapshot,
    generatedAt: now.toISOString(),
  };
}
