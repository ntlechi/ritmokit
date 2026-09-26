import "server-only";

import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { getWeekRange } from "@/lib/calendar/grid";
import { loadDanceAnalyticsForLocation } from "@/lib/dance/analytics";
import type { DanceAnalyticsBundle } from "@/lib/dance/analytics";
import type { StudioCalendarPayload } from "@/lib/dance/studio-calendar";
import { getAccueilRosterForUser, type AccueilClassCard } from "@/lib/data/accueil-roster";
import { countIntakeByStatus, listIntakes, type IntakeRow } from "@/lib/data/intake";
import { getStudioCalendarForUser } from "@/lib/data/studio-calendar";
import { computeLocationKpiSnapshot } from "@/lib/kpi/compute";
import type { LocationKpiSnapshot } from "@/lib/kpi/types";
import { loadOwnerPulse, type OwnerPulse } from "@/lib/data/owner-pulse";
import type { Locale } from "@/lib/i18n/config";
import type { Role } from "@/generated/prisma/enums";

const NEW_STUDENTS_PREVIEW = 5;

export type StudioCockpitData = {
  locationId: string;
  locationName: string;
  analytics: DanceAnalyticsBundle;
  kpiSnapshot: LocationKpiSnapshot;
  ownerPulse: OwnerPulse;
  /** Today-first layer; each part degrades to empty on its own. */
  tonight: AccueilClassCard[];
  newStudents: { rows: IntakeRow[]; openCount: number };
  week: StudioCalendarPayload | null;
  todayCivil: string;
  generatedAt: string;
};

function logAndDefault<T>(scope: string, fallback: T) {
  return (error: unknown): T => {
    console.error(`[studio-cockpit] ${scope}`, error);
    return fallback;
  };
}

export async function getStudioCockpitData(
  userId: string,
  role: Role,
  locale: Locale = "fr",
): Promise<StudioCockpitData | null> {
  if (!canAccessManagerSettings(role)) return null;

  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const locationId = membership.locationId;
  const now = new Date();
  const week = getWeekRange(now);

  const timezone = membership.location.timezone || "America/Toronto";
  const [analytics, kpiSnapshot, ownerPulse, roster, newStudents, weekCalendar] =
    await Promise.all([
      loadDanceAnalyticsForLocation(locationId),
      computeLocationKpiSnapshot(locationId, now),
      loadOwnerPulse(locationId, timezone, now),
      getAccueilRosterForUser(userId, { locale, date: now }).catch(
        logAndDefault("tonight", null),
      ),
      Promise.all([
        listIntakes(locationId, ["NEW", "CONTACTED"], { take: NEW_STUDENTS_PREVIEW }),
        countIntakeByStatus(locationId),
      ])
        .then(([page, counts]) => ({ rows: page.rows, openCount: counts.NEW + counts.CONTACTED }))
        .catch(logAndDefault("new-students", { rows: [], openCount: 0 })),
      getStudioCalendarForUser(userId, locale, week.start, week.end).catch(
        logAndDefault("week", null),
      ),
    ]);

  return {
    locationId,
    locationName: membership.location.name,
    analytics,
    kpiSnapshot,
    ownerPulse,
    tonight: roster?.classes ?? [],
    newStudents,
    week: weekCalendar,
    todayCivil: roster?.date ?? now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
  };
}
