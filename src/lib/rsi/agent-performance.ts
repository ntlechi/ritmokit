import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import { getPulseWeekBounds, getPulseWeekParts } from "@/lib/pulse/week";
import {
  getAgentPlaybookSettings,
  type AgentPlaybookName,
  type CrisisPlaybookSettings,
  type LateArrivalPlaybookSettings,
} from "@/lib/rsi/playbooks";

const MAX_SUGGESTED_CARDS = 3;
const CRISIS_EMPTY_MATCH_THRESHOLD = 2;
const LATE_NO_SHIFT_THRESHOLD = 3;
const LATE_NO_ALERT_THRESHOLD = 3;

export type SuggestedPlaybookView = {
  id: string;
  agentName: AgentPlaybookName;
  rationale: string;
  currentConfig: Record<string, unknown>;
  proposedConfig: Record<string, unknown>;
  evidence: Record<string, unknown>;
  createdAt: string;
};

type ProposalCandidate = {
  agentName: AgentPlaybookName;
  fingerprint: string;
  currentConfig: Record<string, unknown>;
  proposedConfig: Record<string, unknown>;
  evidence: Record<string, unknown>;
  rationaleFr: string;
  rationaleEn: string;
  rationaleEs: string;
};

function weekFingerprint(prefix: string, year: number, weekNumber: number, suffix: string) {
  return `${prefix}:${year}-W${weekNumber}:${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickRationale(
  row: { rationaleFr: string; rationaleEn: string; rationaleEs: string },
  lang: Locale,
): string {
  if (lang === "en") return row.rationaleEn;
  if (lang === "es") return row.rationaleEs;
  return row.rationaleFr;
}

/**
 * Analyse déterministe des AgentLog SUCCEEDED de la semaine ISO.
 * Propose uniquement des patches de variables (pas de freestyle).
 */
export async function collectPlaybookProposalCandidates(
  locationId: string,
): Promise<ProposalCandidate[]> {
  const { weekNumber, year } = getPulseWeekParts();
  const { start, end } = getPulseWeekBounds();

  const [crisisSettings, lateSettings, logs] = await Promise.all([
    getAgentPlaybookSettings(locationId, "CRISIS_REPLACEMENT"),
    getAgentPlaybookSettings(locationId, "LATE_ARRIVAL"),
    prisma.agentLog.findMany({
      where: {
        status: "SUCCEEDED",
        completedAt: { gte: start, lt: end },
        OR: [
          { relatedShift: { locationId } },
          {
            payload: {
              path: ["locationId"],
              equals: locationId,
            },
          },
        ],
      },
      select: {
        channel: true,
        eventType: true,
        result: true,
        payload: true,
        relatedShift: { select: { stationId: true, locationId: true } },
      },
      take: 200,
    }),
  ]);

  const candidates: ProposalCandidate[] = [];

  // --- Crisis: empty matches while scanning a thin same-station pool ---
  const crisisRuns = logs.filter(
    (log) =>
      log.channel === "agent:crisis" &&
      log.eventType === "shift.crisis" &&
      isRecord(log.result) &&
      log.result.matched === false &&
      log.result.reason === "no_eligible_candidate",
  );

  if (
    crisisRuns.length >= CRISIS_EMPTY_MATCH_THRESHOLD &&
    !crisisSettings.allowCrossStation
  ) {
    const stationIds = crisisRuns
      .map((r) => r.relatedShift?.stationId)
      .filter((s): s is string => Boolean(s));
    const stationCounts = stationIds.reduce<Record<string, number>>((acc, s) => {
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    const topStation =
      Object.entries(stationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    const scannedAvg =
      crisisRuns.reduce((sum, r) => {
        const scanned = isRecord(r.result) && typeof r.result.candidatesScanned === "number"
          ? r.result.candidatesScanned
          : 0;
        return sum + scanned;
      }, 0) / crisisRuns.length;

    const proposed: CrisisPlaybookSettings = {
      ...crisisSettings,
      allowCrossStation: true,
      preferSameStationFirst: true,
    };

    candidates.push({
      agentName: "CRISIS_REPLACEMENT",
      fingerprint: weekFingerprint("CRISIS_REPLACEMENT", year, weekNumber, "CROSS_STATION"),
      currentConfig: { ...crisisSettings },
      proposedConfig: { ...proposed },
      evidence: {
        emptyMatches: crisisRuns.length,
        avgScanned: Math.round(scannedAvg * 10) / 10,
        topStation,
        weekNumber,
        year,
      },
      rationaleFr: `${crisisRuns.length} crises sans remplaçant cette semaine (bassin moyen ~${scannedAvg.toFixed(0)} sur ${topStation}). Propose d’élargir le balayage aux employés polyvalents des autres stations, en gardant la priorité à la station d’origine.`,
      rationaleEn: `${crisisRuns.length} crises with no replacement this week (avg pool ~${scannedAvg.toFixed(0)} on ${topStation}). Propose widening the scan to cross-trained employees from other stations, still preferring the home station first.`,
      rationaleEs: `${crisisRuns.length} crisis sin reemplazo esta semana (promedio ~${scannedAvg.toFixed(0)} en ${topStation}). Propone ampliar el barrido a empleados polivalentes de otras estaciones, priorizando la estación de origen.`,
    });
  }

  // --- Late arrival: intent matched but no shift / no management alert ---
  const lateRuns = logs.filter(
    (log) =>
      log.channel === "agent:chat" &&
      log.eventType === "chat.message_posted" &&
      isRecord(log.result) &&
      log.result.handled === true &&
      log.result.intent === "late_arrival",
  );

  const lateNoShift = lateRuns.filter(
    (log) => isRecord(log.result) && log.result.shiftId == null,
  );
  const lateNoAlert = lateRuns.filter(
    (log) =>
      isRecord(log.result) &&
      log.result.alerted === false &&
      log.result.shiftId != null,
  );

  if (lateNoShift.length >= LATE_NO_SHIFT_THRESHOLD) {
    const proposed: LateArrivalPlaybookSettings = {
      ...lateSettings,
      windowBeforeHours: Math.min(4, lateSettings.windowBeforeHours + 1),
      windowAfterHours: Math.min(8, lateSettings.windowAfterHours + 2),
    };

    // Only propose if something actually changes
    if (
      proposed.windowBeforeHours !== lateSettings.windowBeforeHours ||
      proposed.windowAfterHours !== lateSettings.windowAfterHours
    ) {
      candidates.push({
        agentName: "LATE_ARRIVAL",
        fingerprint: weekFingerprint("LATE_ARRIVAL", year, weekNumber, "WIDEN_WINDOW"),
        currentConfig: { ...lateSettings },
        proposedConfig: { ...proposed },
        evidence: {
          lateHandled: lateRuns.length,
          lateNoShift: lateNoShift.length,
          weekNumber,
          year,
        },
        rationaleFr: `${lateNoShift.length} signalements de retard sans quart associé cette semaine. Propose d’élargir la fenêtre de recherche (${lateSettings.windowBeforeHours}h→${proposed.windowBeforeHours}h avant, ${lateSettings.windowAfterHours}h→${proposed.windowAfterHours}h après).`,
        rationaleEn: `${lateNoShift.length} late reports with no linked shift this week. Propose widening the search window (${lateSettings.windowBeforeHours}h→${proposed.windowBeforeHours}h before, ${lateSettings.windowAfterHours}h→${proposed.windowAfterHours}h after).`,
        rationaleEs: `${lateNoShift.length} reportes de retraso sin turno asociado esta semana. Propone ampliar la ventana de búsqueda (${lateSettings.windowBeforeHours}h→${proposed.windowBeforeHours}h antes, ${lateSettings.windowAfterHours}h→${proposed.windowAfterHours}h después).`,
      });
    }
  } else if (lateNoAlert.length >= LATE_NO_ALERT_THRESHOLD) {
    // Soft proposal: keep windows, flag evidence for manager (config unchanged except noop marker)
    // Skip — no safe variable to tweak without a management channel; leave for RSI 3.
  }

  // CNESST_GUARD: rules are statutory — never propose relaxing break thresholds.
  // Evidence-only insights stay in RSI 1 (ROSTER_FRICTION), not playbook patches.

  return candidates;
}

/**
 * Upsert SUGGESTED proposals ; ne ressuscite pas APPROVED/REJECTED de la semaine.
 */
export async function syncWeeklyAgentPlaybookProposals(locationId: string): Promise<number> {
  const candidates = await collectPlaybookProposalCandidates(locationId);
  let written = 0;

  for (const proposal of candidates) {
    const existing = await prisma.agentPlaybookProposal.findUnique({
      where: {
        locationId_fingerprint: {
          locationId,
          fingerprint: proposal.fingerprint,
        },
      },
    });

    if (existing && existing.status !== "SUGGESTED") {
      continue;
    }

    await prisma.agentPlaybookProposal.upsert({
      where: {
        locationId_fingerprint: {
          locationId,
          fingerprint: proposal.fingerprint,
        },
      },
      update: {
        currentConfig: proposal.currentConfig as Prisma.InputJsonValue,
        proposedConfig: proposal.proposedConfig as Prisma.InputJsonValue,
        evidence: proposal.evidence as Prisma.InputJsonValue,
        rationaleFr: proposal.rationaleFr,
        rationaleEn: proposal.rationaleEn,
        rationaleEs: proposal.rationaleEs,
        agentName: proposal.agentName,
      },
      create: {
        locationId,
        agentName: proposal.agentName,
        fingerprint: proposal.fingerprint,
        currentConfig: proposal.currentConfig as Prisma.InputJsonValue,
        proposedConfig: proposal.proposedConfig as Prisma.InputJsonValue,
        evidence: proposal.evidence as Prisma.InputJsonValue,
        rationaleFr: proposal.rationaleFr,
        rationaleEn: proposal.rationaleEn,
        rationaleEs: proposal.rationaleEs,
        status: "SUGGESTED",
      },
    });
    written += 1;
  }

  const keep = candidates.map((c) => c.fingerprint);
  await prisma.agentPlaybookProposal.deleteMany({
    where: {
      locationId,
      status: "SUGGESTED",
      ...(keep.length > 0 ? { fingerprint: { notIn: keep } } : {}),
    },
  });

  return written;
}

export async function getSuggestedPlaybookProposals(
  locationId: string,
  lang: Locale,
  limit = MAX_SUGGESTED_CARDS,
): Promise<SuggestedPlaybookView[]> {
  const rows = await prisma.agentPlaybookProposal.findMany({
    where: { locationId, status: "SUGGESTED" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    agentName: row.agentName as AgentPlaybookName,
    rationale: pickRationale(row, lang),
    currentConfig: (row.currentConfig ?? {}) as Record<string, unknown>,
    proposedConfig: (row.proposedConfig ?? {}) as Record<string, unknown>,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }));
}

export { MAX_SUGGESTED_CARDS };
