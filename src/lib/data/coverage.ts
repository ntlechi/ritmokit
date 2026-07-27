import "server-only";

import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { calculateCoverageScore, type CoverageScoreReport } from "@/lib/scheduling/coverage";
import { getStaffingProfilesForLocation } from "@/lib/scheduling/staffing-curve";

export type CoverageScoreResult =
  | { ok: true; data: CoverageScoreReport }
  | { ok: false; error: "unauthorized" };

export async function getCoverageScoreForUser(
  userId: string,
  userRole: string,
  targetDate: Date,
): Promise<CoverageScoreResult> {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await getPrimaryMembership(userId);
  if (!membership) return { ok: false, error: "unauthorized" };

  const data = await calculateCoverageScore({ locationId: membership.locationId, targetDate });
  return { ok: true, data };
}

export type DayCoverageAlerts = { date: string; alerts: CoverageScoreReport["alerts"] };

export type WeeklyCoverageResult =
  | { ok: true; days: DayCoverageAlerts[] }
  | { ok: false; error: "unauthorized" };

/** Alertes de couverture condensées pour chaque jour d'une semaine — pilote la bannière au-dessus du calendrier gérant. */
export async function getWeeklyCoverageForUser(
  userId: string,
  userRole: string,
  days: Date[],
): Promise<WeeklyCoverageResult> {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await getPrimaryMembership(userId);
  if (!membership) return { ok: false, error: "unauthorized" };

  // Warm staffing profiles once — calculateCoverageScore reuses the React.cache hit.
  await getStaffingProfilesForLocation(membership.locationId);

  const reports = await Promise.all(
    days.map((day) => calculateCoverageScore({ locationId: membership.locationId, targetDate: day })),
  );

  return {
    ok: true,
    days: reports.map((report) => ({ date: report.targetDate, alerts: report.alerts })),
  };
}
