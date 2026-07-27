import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import { getPulseWeekParts } from "@/lib/pulse/week";
import { getShoutOutWeekStats } from "@/lib/data/shoutouts";
import {
  getOpenInsightsForLocation,
  type OpenInsightView,
} from "@/lib/rsi/insights";
import {
  getSuggestedPlaybookProposals,
  type SuggestedPlaybookView,
} from "@/lib/rsi/agent-performance";
import {
  getRecentAutopilotRuns,
  type AutopilotLoopRunView,
} from "@/lib/autopilot/sync";
import {
  getOrganizationExperiments,
  type ExperimentDashboardRow,
} from "@/lib/rsi/platform-experiments";

const FEEDBACK_WINDOW_MS = 36 * 60 * 60 * 1000;
const PULSE_ALERT_THRESHOLD = 3.0;

export type CultureValueView = {
  id: string;
  valueKey: string;
  title: string;
  behavior: string;
  sortOrder: number;
};

/** Full multilingual row for the constitution editor (Marie / Alex). */
export type CultureValueEditable = {
  id: string;
  valueKey: string;
  titleFr: string;
  titleEn: string;
  titleEs: string;
  behaviorFr: string;
  behaviorEn: string;
  behaviorEs: string;
  sortOrder: number;
  isActive: boolean;
};

export type CulturePulseStation = {
  stationId: string;
  stationNameFr: string;
  stationNameEn: string;
  stationNameEs: string;
  averageScore: number;
  count: number;
  isAlert: boolean;
};

export type CultureHealthDashboard = {
  locationId: string;
  locationName: string;
  organizationId: string;
  weekNumber: number;
  year: number;
  values: CultureValueView[];
  constitutionReady: boolean;
  pulseByStation: CulturePulseStation[];
  pulseOverall: number | null;
  pulseResponseCount: number;
  currentValueKey: string | null;
  currentPulseQuestion: string | null;
  overdueOnboardingCount: number;
  recruitsWithoutBuddy: number;
  pendingFeedbackCount: number;
  feedbackCompletionRate: number | null;
  sealedReviewsCount: number;
  shoutOutsWeekCount: number;
  shoutOutsByValue: Array<{ valueKey: string; title: string; count: number }>;
  /** Max 3 OPEN RSI insights — gérant valide avant tout ajustement. */
  openInsights: OpenInsightView[];
  /** Max 3 playbook SUGGESTED — signature humaine avant injection config. */
  playbookProposals: SuggestedPlaybookView[];
  /** Expériences plateforme RSI 3 (flags UX uniquement). */
  experiments: ExperimentDashboardRow[];
  /** Dernières exécutions Mirok Autopilot (loop engineering). */
  autopilotRuns: AutopilotLoopRunView[];
  lastUpdated: string;
};

function pickLocale<T extends { titleFr: string; titleEn: string; titleEs: string; behaviorFr: string; behaviorEn: string; behaviorEs: string }>(
  row: T,
  lang: Locale,
): { title: string; behavior: string } {
  if (lang === "en") return { title: row.titleEn, behavior: row.behaviorEn };
  if (lang === "es") return { title: row.titleEs, behavior: row.behaviorEs };
  return { title: row.titleFr, behavior: row.behaviorFr };
}

function pickQuestionText(
  q: { textFr: string; textEn: string; textEs: string },
  lang: Locale,
): string {
  if (lang === "en") return q.textEn;
  if (lang === "es") return q.textEs;
  return q.textFr;
}

async function resolveManagerLocation(userId: string, role: string) {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: { select: { id: true, name: true, organizationId: true } },
    },
  });
  if (membership) {
    return {
      locationId: membership.location.id,
      locationName: membership.location.name,
      organizationId: membership.location.organizationId,
    };
  }
  if (role !== "ADMIN") return null;
  const loc = await prisma.location.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, organizationId: true },
  });
  if (!loc) return null;
  return {
    locationId: loc.id,
    locationName: loc.name,
    organizationId: loc.organizationId,
  };
}

/**
 * Culture Health — agrège Pulse, onboarding, feedback et constitution
 * pour la vision « Constance » du gérant (lundi matin).
 */
export async function getCultureHealthDashboard(
  userId: string,
  role: string,
  lang: Locale,
): Promise<CultureHealthDashboard | null> {
  const loc = await resolveManagerLocation(userId, role);
  if (!loc) return null;

  const { weekNumber, year } = getPulseWeekParts();
  const now = new Date();
  const feedbackSince = new Date(now.getTime() - FEEDBACK_WINDOW_MS);

  const [
    valueRows,
    pulseGroups,
    weeklyQuestion,
    overdueOnboardingCount,
    recruitsWithoutBuddy,
    recentClockedOut,
    sealedReviewsCount,
    shoutStats,
  ] = await Promise.all([
    prisma.organizationValue.findMany({
      where: { organizationId: loc.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.pulseResponse.groupBy({
      by: ["stationId"],
      where: { locationId: loc.locationId, year, weekNumber },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.pulseQuestion.findUnique({
      where: {
        organizationId_weekNumber_year: {
          organizationId: loc.organizationId,
          weekNumber,
          year,
        },
      },
    }),
    prisma.onboardingTask.count({
      where: {
        locationId: loc.locationId,
        completedAt: null,
        dueDate: { lt: now },
      },
    }),
    prisma.employeeHrProfile.count({
      where: {
        buddyId: null,
        onboardingStatus: { not: "COMPLETED" },
        user: {
          role: "EMPLOYEE",
          locationMembers: { some: { locationId: loc.locationId } },
        },
      },
    }),
    prisma.shift.findMany({
      where: {
        locationId: loc.locationId,
        actualEndsAt: { gte: feedbackSince, not: null },
        employeeId: { not: null },
        status: { in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED", "CRISIS_ALERT"] },
      },
      select: {
        id: true,
        feedback: { select: { id: true } },
      },
    }),
    prisma.quarterlyReview.count({
      where: {
        locationId: loc.locationId,
        status: "SIGNED_AND_COMPLETED",
      },
    }),
    getShoutOutWeekStats(loc.locationId),
  ]);

  // Read-only: Autopilot / RSI sync runs on the weekly cron, never on page load.
  // (Previously every Culture / Ops click paid for write-heavy agent loops.)
  const [openInsights, playbookProposals, experiments, autopilotRuns, stationRows] =
    await Promise.all([
      getOpenInsightsForLocation(loc.locationId),
      getSuggestedPlaybookProposals(loc.locationId, lang),
      getOrganizationExperiments(loc.organizationId, lang),
      getRecentAutopilotRuns(loc.locationId),
      prisma.station.findMany({
        where: { locationId: loc.locationId },
        select: { id: true, nameFr: true, nameEn: true, nameEs: true },
      }),
    ]);
  const stationById = new Map(stationRows.map((s) => [s.id, s]));

  const pulseByStation: CulturePulseStation[] = pulseGroups
    .map((row) => {
      const station = stationById.get(row.stationId);
      const averageScore = Math.round((row._avg?.score ?? 0) * 10) / 10;
      return {
        stationId: row.stationId,
        stationNameFr: station?.nameFr ?? row.stationId,
        stationNameEn: station?.nameEn ?? row.stationId,
        stationNameEs: station?.nameEs ?? row.stationId,
        averageScore,
        count: row._count?._all ?? 0,
        isAlert: averageScore > 0 && averageScore < PULSE_ALERT_THRESHOLD,
      };
    })
    .sort((a, b) => a.stationNameFr.localeCompare(b.stationNameFr));

  const pulseResponseCount = pulseByStation.reduce((sum, s) => sum + s.count, 0);
  const pulseOverall =
    pulseResponseCount === 0
      ? null
      : Math.round(
          (pulseByStation.reduce((sum, s) => sum + s.averageScore * s.count, 0) /
            pulseResponseCount) *
            10,
        ) / 10;

  const eligibleFeedback = recentClockedOut.length;
  const completedFeedback = recentClockedOut.filter((s) => s.feedback).length;
  const pendingFeedbackCount = eligibleFeedback - completedFeedback;
  const feedbackCompletionRate =
    eligibleFeedback === 0
      ? null
      : Math.round((completedFeedback / eligibleFeedback) * 100);

  const values: CultureValueView[] = valueRows.map((row) => {
    const picked = pickLocale(row, lang);
    return {
      id: row.id,
      valueKey: row.valueKey,
      title: picked.title,
      behavior: picked.behavior,
      sortOrder: row.sortOrder,
    };
  });

  const valueTitleMap = new Map(values.map((v) => [v.valueKey, v.title]));
  const shoutOutsByValue = shoutStats.byValue.map((row) => ({
    valueKey: row.valueKey,
    title: valueTitleMap.get(row.valueKey) ?? row.valueKey,
    count: row.count,
  }));

  return {
    locationId: loc.locationId,
    locationName: loc.locationName,
    organizationId: loc.organizationId,
    weekNumber,
    year,
    values,
    constitutionReady: values.length > 0,
    pulseByStation,
    pulseOverall,
    pulseResponseCount,
    currentValueKey: weeklyQuestion?.valueKey ?? null,
    currentPulseQuestion: weeklyQuestion ? pickQuestionText(weeklyQuestion, lang) : null,
    overdueOnboardingCount,
    recruitsWithoutBuddy,
    pendingFeedbackCount,
    feedbackCompletionRate,
    sealedReviewsCount,
    shoutOutsWeekCount: shoutStats.count,
    shoutOutsByValue,
    openInsights,
    playbookProposals,
    experiments,
    autopilotRuns,
    lastUpdated: now.toISOString(),
  };
}

export async function getOrganizationValuesForUser(
  userId: string,
  lang: Locale,
): Promise<CultureValueView[]> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: { select: { organizationId: true } } },
  });
  if (!membership) return [];

  const rows = await prisma.organizationValue.findMany({
    where: { organizationId: membership.location.organizationId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return rows.map((row) => {
    const picked = pickLocale(row, lang);
    return {
      id: row.id,
      valueKey: row.valueKey,
      title: picked.title,
      behavior: picked.behavior,
      sortOrder: row.sortOrder,
    };
  });
}

/** Rows for the constitution editor — all locales, editable by MANAGER/OWNER. */
export async function getEditableOrganizationValues(
  userId: string,
  role: string,
): Promise<{ organizationId: string; values: CultureValueEditable[] } | null> {
  const loc = await resolveManagerLocation(userId, role);
  if (!loc) return null;

  const rows = await prisma.organizationValue.findMany({
    where: { organizationId: loc.organizationId },
    orderBy: { sortOrder: "asc" },
  });

  return {
    organizationId: loc.organizationId,
    values: rows.map((row) => ({
      id: row.id,
      valueKey: row.valueKey,
      titleFr: row.titleFr,
      titleEn: row.titleEn,
      titleEs: row.titleEs,
      behaviorFr: row.behaviorFr,
      behaviorEn: row.behaviorEn,
      behaviorEs: row.behaviorEs,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    })),
  };
}
