import "server-only";

import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { loadDanceAnalyticsForLocation } from "@/lib/dance/analytics";
import type { DanceAnalyticsBundle } from "@/lib/dance/analytics";
import { computeLocationKpiSnapshot } from "@/lib/kpi/compute";
import type { LocationKpiSnapshot } from "@/lib/kpi/types";
import { loadOwnerPulse, type OwnerPulse } from "@/lib/data/owner-pulse";
import type { Role } from "@/generated/prisma/enums";

export type StudioCockpitData = {
  locationId: string;
  locationName: string;
  analytics: DanceAnalyticsBundle;
  kpiSnapshot: LocationKpiSnapshot;
  ownerPulse: OwnerPulse;
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

  const timezone = membership.location.timezone || "America/Toronto";
  const [analytics, kpiSnapshot, ownerPulse] = await Promise.all([
    loadDanceAnalyticsForLocation(locationId),
    computeLocationKpiSnapshot(locationId, now),
    loadOwnerPulse(locationId, timezone, now),
  ]);

  return {
    locationId,
    locationName: membership.location.name,
    analytics,
    kpiSnapshot,
    ownerPulse,
    generatedAt: now.toISOString(),
  };
}
