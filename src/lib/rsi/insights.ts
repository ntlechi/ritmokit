import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type {
  InsightSeverity,
  InsightType,
} from "@/generated/prisma/enums";
import { getStationsForLocation } from "@/lib/data/stations";
import { stationLabel as displayStationLabel } from "@/lib/stations/display";
import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import { getPulseWeekBounds, getPulseWeekParts } from "@/lib/pulse/week";
import { getShoutOutWeekStats } from "@/lib/data/shoutouts";

const PULSE_ALERT_THRESHOLD = 3.0;
const PULSE_MIN_RESPONSES = 2;
const FEEDBACK_WINDOW_MS = 36 * 60 * 60 * 1000;
const FEEDBACK_PENDING_THRESHOLD = 2;
const ONBOARDING_OVERDUE_THRESHOLD = 1;
const NO_BUDDY_THRESHOLD = 1;
const SHOUTOUT_SPIKE_THRESHOLD = 3;
const MAX_OPEN_CARDS = 3;

export type InsightCandidate = {
  type: InsightType;
  severity: InsightSeverity;
  fingerprint: string;
  evidence: Record<string, unknown>;
  suggestedAction: string;
  actionLink: string;
};

export type OpenInsightView = {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  suggestedAction: string;
  actionLink: string;
  evidence: Record<string, unknown>;
  createdAt: string;
};

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function weekFingerprint(prefix: string, year: number, weekNumber: number, suffix?: string) {
  return suffix
    ? `${prefix}:${year}-W${weekNumber}:${suffix}`
    : `${prefix}:${year}-W${weekNumber}`;
}

function stationLabelFromId(
  stationId: string,
  stations: Awaited<ReturnType<typeof getStationsForLocation>>,
  lang: Locale,
): string {
  const station = stations.find((s) => s.id === stationId);
  return station ? displayStationLabel(station, lang) : stationId;
}

function copy(
  lang: Locale,
  fr: string,
  en: string,
  es: string,
): string {
  if (lang === "en") return en;
  if (lang === "es") return es;
  return fr;
}

/**
 * Capteurs déterministes — Pulse, feedback 36h, onboarding, shout-outs.
 * Aucune identité Pulse ; preuves agrégées uniquement.
 */
export async function collectInsightCandidates(
  locationId: string,
  organizationId: string,
  lang: Locale,
): Promise<InsightCandidate[]> {
  const { weekNumber, year } = getPulseWeekParts();
  const { start, end } = getPulseWeekBounds();
  const now = new Date();
  const feedbackSince = new Date(now.getTime() - FEEDBACK_WINDOW_MS);

  const [pulseGroups, overdueOnboarding, noBuddy, recentClockedOut, shoutStats, valueRows, stations] =
    await Promise.all([
      prisma.pulseResponse.groupBy({
        by: ["stationId"],
        where: { locationId, year, weekNumber },
        _avg: { score: true },
        _count: { _all: true },
      }),
      prisma.onboardingTask.count({
        where: {
          locationId,
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
            locationMembers: { some: { locationId } },
          },
        },
      }),
      prisma.shift.findMany({
        where: {
          locationId,
          actualEndsAt: { gte: feedbackSince, not: null },
          employeeId: { not: null },
          status: {
            in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED", "CRISIS_ALERT"],
          },
        },
        select: { id: true, feedback: { select: { id: true } } },
      }),
      getShoutOutWeekStats(locationId),
      prisma.organizationValue.findMany({
        where: { organizationId, isActive: true },
        select: { valueKey: true, titleFr: true, titleEn: true, titleEs: true },
      }),
      getStationsForLocation(locationId),
    ]);

  const candidates: InsightCandidate[] = [];

  // Sensor 1 — Pulse alert by station (anonymous aggregates only)
  for (const row of pulseGroups) {
    const averageScore = Math.round((row._avg?.score ?? 0) * 10) / 10;
    const count = row._count?._all ?? 0;
    if (count < PULSE_MIN_RESPONSES || averageScore <= 0 || averageScore >= PULSE_ALERT_THRESHOLD) {
      continue;
    }
    const stationId = row.stationId;
    const label = stationLabelFromId(stationId, stations, lang);
    candidates.push({
      type: "PULSE_ALERT",
      severity: averageScore < 2.5 ? "HIGH" : "MEDIUM",
      fingerprint: weekFingerprint("PULSE_ALERT", year, weekNumber, stationId),
      evidence: {
        stationId,
        averageScore,
        responseCount: count,
        weekNumber,
        year,
        threshold: PULSE_ALERT_THRESHOLD,
      },
      suggestedAction: copy(
        lang,
        `Le moral en ${label} est à ${averageScore.toFixed(1)}/5 (seuil ${PULSE_ALERT_THRESHOLD}). Briefing station + activer « L'équipe d'abord » dans la rotation Pulse de la semaine prochaine.`,
        `${label} Pulse is at ${averageScore.toFixed(1)}/5 (threshold ${PULSE_ALERT_THRESHOLD}). Run a station briefing and prioritize “Team first” in next week's Pulse rotation.`,
        `El moral en ${label} está en ${averageScore.toFixed(1)}/5 (umbral ${PULSE_ALERT_THRESHOLD}). Haz un briefing de estación y prioriza «Equipo primero» en la rotación Pulse de la próxima semana.`,
      ),
      actionLink: "/settings/manager/pulse",
    });
  }

  // Sensor 2 — Manager rigor (flash feedback backlog)
  const eligibleFeedback = recentClockedOut.length;
  const completedFeedback = recentClockedOut.filter((s) => s.feedback).length;
  const pendingFeedback = eligibleFeedback - completedFeedback;
  if (pendingFeedback >= FEEDBACK_PENDING_THRESHOLD) {
    const rate =
      eligibleFeedback === 0
        ? 0
        : Math.round((completedFeedback / eligibleFeedback) * 100);
    candidates.push({
      type: "ROSTER_FRICTION",
      severity: pendingFeedback >= 5 ? "HIGH" : "MEDIUM",
      fingerprint: weekFingerprint("ROSTER_FRICTION", year, weekNumber, "FEEDBACK_36H"),
      evidence: {
        pendingFeedback,
        eligibleFeedback,
        completedFeedback,
        completionRate: rate,
        windowHours: 36,
        weekNumber,
        year,
      },
      suggestedAction: copy(
        lang,
        `${pendingFeedback} feedback(s) flash en attente (36 h). Complète-les sur la pointeuse — levier Chatman de constance managériale.`,
        `${pendingFeedback} flash feedback(s) pending (36h). Clear them on the time clock — managerial consistency lever.`,
        `${pendingFeedback} feedback(s) flash pendientes (36 h). Complétalos en el fichaje — palanca de constancia gerencial.`,
      ),
      actionLink: "/pointeuse",
    });
  }

  // Sensor 3 — Onboarding lag (overdue tasks and/or no buddy)
  if (overdueOnboarding >= ONBOARDING_OVERDUE_THRESHOLD || noBuddy >= NO_BUDDY_THRESHOLD) {
    const severity: InsightSeverity =
      overdueOnboarding >= 3 || noBuddy >= 2 ? "HIGH" : "MEDIUM";
    candidates.push({
      type: "ONBOARDING_LAG",
      severity,
      fingerprint: weekFingerprint("ONBOARDING_LAG", year, weekNumber),
      evidence: {
        overdueOnboarding,
        recruitsWithoutBuddy: noBuddy,
        weekNumber,
        year,
      },
      suggestedAction: copy(
        lang,
        `${overdueOnboarding} tâche(s) d'intégration en retard · ${noBuddy} recrue(s) sans buddy. Assigne un parrain et coche les jalons J+1 / J+7 / J+30.`,
        `${overdueOnboarding} overdue onboarding task(s) · ${noBuddy} recruit(s) without a buddy. Assign a buddy and clear J+1 / J+7 / J+30 milestones.`,
        `${overdueOnboarding} tarea(s) de integración atrasada(s) · ${noBuddy} recluta(s) sin buddy. Asigna un padrino y cierra los hitos J+1 / J+7 / J+30.`,
      ),
      actionLink: "/settings/manager/onboarding",
    });
  }

  // Sensor 4 — Positive reinforcement spike (what's working)
  const topShout = shoutStats.byValue[0];
  if (topShout && topShout.count >= SHOUTOUT_SPIKE_THRESHOLD) {
    const valueRow = valueRows.find((v) => v.valueKey === topShout.valueKey);
    const valueTitle =
      lang === "en"
        ? (valueRow?.titleEn ?? topShout.valueKey)
        : lang === "es"
          ? (valueRow?.titleEs ?? topShout.valueKey)
          : (valueRow?.titleFr ?? topShout.valueKey);
    candidates.push({
      type: "SHOUTOUT_SPIKE",
      severity: "LOW",
      fingerprint: weekFingerprint("SHOUTOUT_SPIKE", year, weekNumber, topShout.valueKey),
      evidence: {
        valueKey: topShout.valueKey,
        count: topShout.count,
        weekTotal: shoutStats.count,
        weekNumber,
        year,
      },
      suggestedAction: copy(
        lang,
        `Renforcement fort sur « ${valueTitle} » (${topShout.count} shout-outs cette semaine). Relais en briefing : célébrer et répéter ce comportement au rush.`,
        `Strong reinforcement on “${valueTitle}” (${topShout.count} shout-outs this week). Relay in briefing: celebrate and repeat this rush behavior.`,
        `Fuerte refuerzo en « ${valueTitle} » (${topShout.count} shout-outs esta semana). Reléalo en el briefing: celebra y repite este comportamiento en el rush.`,
      ),
      actionLink: "/calendar/mobile",
    });
  }

  return candidates.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

/**
 * Upsert sécurisé : met à jour un OPEN existant ; ne réécrit pas APPLIED/DISMISSED.
 * Fingerprint = type + semaine ISO (+ station/valeur) → un OPEN max par signal/semaine.
 */
export async function syncWeeklyOperationalInsights(
  locationId: string,
  organizationId: string,
  lang: Locale,
): Promise<number> {
  const candidates = await collectInsightCandidates(locationId, organizationId, lang);
  let written = 0;

  for (const insight of candidates) {
    const existing = await prisma.improvementInsight.findUnique({
      where: {
        locationId_fingerprint: {
          locationId,
          fingerprint: insight.fingerprint,
        },
      },
    });

    if (existing && existing.status !== "OPEN") {
      // Gérant a déjà tranché — ne pas ressusciter le même fingerprint cette semaine.
      continue;
    }

    await prisma.improvementInsight.upsert({
      where: {
        locationId_fingerprint: {
          locationId,
          fingerprint: insight.fingerprint,
        },
      },
      update: {
        severity: insight.severity,
        evidence: insight.evidence as Prisma.InputJsonValue,
        suggestedAction: insight.suggestedAction,
        actionLink: insight.actionLink,
        type: insight.type,
      },
      create: {
        locationId,
        type: insight.type,
        severity: insight.severity,
        fingerprint: insight.fingerprint,
        evidence: insight.evidence as Prisma.InputJsonValue,
        suggestedAction: insight.suggestedAction,
        actionLink: insight.actionLink,
        status: "OPEN",
      },
    });
    written += 1;
  }

  // Signal disparu → retirer la proposition OPEN (pas un DISMISSED gérant).
  const keep = candidates.map((c) => c.fingerprint);
  await prisma.improvementInsight.deleteMany({
    where: {
      locationId,
      status: "OPEN",
      ...(keep.length > 0
        ? { fingerprint: { notIn: keep } }
        : {}),
    },
  });

  return written;
}

/** Top N insights OPEN pour Culture Health (HIGH → LOW). */
export async function getOpenInsightsForLocation(
  locationId: string,
  limit = MAX_OPEN_CARDS,
): Promise<OpenInsightView[]> {
  const rows = await prisma.improvementInsight.findMany({
    where: { locationId, status: "OPEN" },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  // Prisma enum order is declaration order, not severity rank — re-sort in memory.
  return rows
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      suggestedAction: row.suggestedAction,
      actionLink: row.actionLink,
      evidence: (row.evidence ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));
}

export { MAX_OPEN_CARDS };
