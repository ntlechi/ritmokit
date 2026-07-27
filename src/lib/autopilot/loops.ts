import "server-only";

import type { AutopilotLoopKind } from "@/generated/prisma/enums";
import {
  getLoopCircuitBreaker,
  isLocationInRush,
  trackDbQuery,
  type AutopilotBudgetLedger,
} from "@/lib/autopilot/governor";
import {
  recordLoopRun,
  upsertPlaybookCandidate,
  weekFingerprint,
  type PlaybookCandidate,
} from "@/lib/autopilot/record";
import { prisma } from "@/lib/prisma";
import { locationTimeZone } from "@/lib/time/location-timezone";
import {
  getAgentPlaybookSettings,
  type AssiduityPlaybookSettings,
  type CodeRedSurgePlaybookSettings,
} from "@/lib/rsi/playbooks";

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * (idx - lo);
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function hourInLocationTz(instant: Date, locationId: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: locationTimeZone(locationId),
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

type LatenessBucket = {
  userId: string;
  fullName: string;
  startHour: number;
  latenessMinutes: number[];
};

/**
 * Loop D — Assiduity: recurring lateness → schedule buffer proposal (SUGGESTED only).
 */
export async function runAssiduityLoop(
  locationId: string,
  year: number,
  weekNumber: number,
  ledger?: AutopilotBudgetLedger,
): Promise<PlaybookCandidate[]> {
  const settings = await getAgentPlaybookSettings(locationId, "ASSIDUITY");
  if (ledger) trackDbQuery(ledger, 1);

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - settings.lookbackWeeks * 7);

  const shifts = await prisma.shift.findMany({
    where: {
      locationId,
      employeeId: { not: null },
      actualStartsAt: { not: null },
      startsAt: { gte: windowStart },
      status: { in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED", "CRISIS_ALERT"] },
      // Excused lateness (self-reported) excluded from the sensor.
      lateArrivalFlag: false,
    },
    select: {
      employeeId: true,
      startsAt: true,
      actualStartsAt: true,
      employee: { select: { fullName: true } },
    },
  });
  if (ledger) trackDbQuery(ledger, 1);

  const buckets = new Map<string, LatenessBucket>();

  for (const shift of shifts) {
    if (!shift.employeeId || !shift.actualStartsAt) continue;
    const lateMin = Math.round(
      (shift.actualStartsAt.getTime() - shift.startsAt.getTime()) / 60_000,
    );
    if (lateMin < 0) continue; // early arrivals don't drive buffer proposals

    const startHour = hourInLocationTz(shift.startsAt, locationId);
    const key = `${shift.employeeId}:${startHour}`;
    const row =
      buckets.get(key) ??
      ({
        userId: shift.employeeId,
        fullName: shift.employee?.fullName ?? "Employé",
        startHour,
        latenessMinutes: [],
      } satisfies LatenessBucket);
    row.latenessMinutes.push(lateMin);
    buckets.set(key, row);
  }

  const proposals: PlaybookCandidate[] = [];
  const evidenceSlots: Record<string, unknown>[] = [];

  for (const bucket of buckets.values()) {
    const n = bucket.latenessMinutes.length;
    if (n < settings.minSampleSize) continue;

    const sorted = [...bucket.latenessMinutes].sort((a, b) => a - b);
    const p85 = percentile(sorted, 0.85);
    const median = percentile(sorted, 0.5);
    const significantLates = bucket.latenessMinutes.filter(
      (m) => m >= settings.lateThresholdMinutes,
    ).length;

    evidenceSlots.push({
      userId: bucket.userId,
      fullName: bucket.fullName,
      startHour: bucket.startHour,
      sampleSize: n,
      medianLateMinutes: Math.round(median * 10) / 10,
      p85LateMinutes: Math.round(p85 * 10) / 10,
      significantLates,
    });

    if (
      significantLates < settings.minLateOccurrences ||
      p85 < settings.minBufferMinutes
    ) {
      continue;
    }

    const bufferMinutes = Math.min(
      settings.maxBufferMinutes,
      Math.max(settings.minBufferMinutes, roundTo5(p85)),
    );

    const existing =
      settings.scheduleBuffers.find(
        (b) => b.userId === bucket.userId && b.startHour === bucket.startHour,
      )?.bufferMinutes ?? 0;

    // Hysteresis: only propose an increase (decay handled by Drift-Guard).
    if (bufferMinutes <= existing) continue;

    const nextBuffers = [
      ...settings.scheduleBuffers.filter(
        (b) => !(b.userId === bucket.userId && b.startHour === bucket.startHour),
      ),
      { userId: bucket.userId, startHour: bucket.startHour, bufferMinutes },
    ];

    const proposed: AssiduityPlaybookSettings = {
      ...settings,
      scheduleBuffers: nextBuffers,
    };

    proposals.push({
      agentName: "ASSIDUITY",
      fingerprint: weekFingerprint(
        "ASSIDUITY",
        year,
        weekNumber,
        `${bucket.userId.slice(0, 8)}-H${bucket.startHour}`,
      ),
      currentConfig: { ...settings },
      proposedConfig: { ...proposed },
      evidence: {
        userId: bucket.userId,
        fullName: bucket.fullName,
        startHour: bucket.startHour,
        sampleSize: n,
        p85LateMinutes: Math.round(p85 * 10) / 10,
        medianLateMinutes: Math.round(median * 10) / 10,
        significantLates,
        proposedBufferMinutes: bufferMinutes,
        existingBufferMinutes: existing,
      },
      rationaleFr: `${bucket.fullName} : p85 de retard ${Math.round(p85)} min sur les quarts à ${bucket.startHour}h (${significantLates} retards ≥ ${settings.lateThresholdMinutes} min, n=${n}). Autopilot propose un tampon de ${bufferMinutes} min (avancer le début planifié).`,
      rationaleEn: `${bucket.fullName}: p85 lateness ${Math.round(p85)} min on ${bucket.startHour}h starts (${significantLates} lates ≥ ${settings.lateThresholdMinutes} min, n=${n}). Autopilot proposes a ${bufferMinutes}-minute schedule buffer.`,
      rationaleEs: `${bucket.fullName}: p85 de retraso ${Math.round(p85)} min en turnos de las ${bucket.startHour}h (${significantLates} retrasos ≥ ${settings.lateThresholdMinutes} min, n=${n}). Autopilot propone un buffer de ${bufferMinutes} min.`,
    });
  }

  await recordLoopRun({
    locationId,
    loopKind: "ASSIDUITY",
    year,
    weekNumber,
    metricName: "assiduityBufferCandidates",
    metricValue: proposals.length,
    targetValue: settings.minLateOccurrences,
    deltaValue: proposals.length,
    outcome: proposals.length > 0 ? "PROPOSED" : "NO_ACTION",
    evidence: {
      lookbackWeeks: settings.lookbackWeeks,
      slotsMeasured: evidenceSlots.length,
      candidates: evidenceSlots.slice(0, 20),
      proposals: proposals.length,
    },
  });

  return proposals;
}

/**
 * Loop E — Token/Compute Safeguard: rush defer + budget ledger + breaker visibility.
 */
export async function runTokenSafeguardLoop(input: {
  locationId: string;
  year: number;
  weekNumber: number;
  ledger: AutopilotBudgetLedger;
  deferredForRush: boolean;
  rushEvidence?: Record<string, unknown>;
  openBreakers: string[];
}): Promise<PlaybookCandidate | null> {
  const settings = await getAgentPlaybookSettings(input.locationId, "TOKEN_SAFEGUARD");
  trackDbQuery(input.ledger, 1);

  const overBudget =
    input.ledger.dbQueries > settings.maxDbQueriesPerLocation ||
    input.ledger.durationMs > settings.maxDurationMsPerLocation ||
    input.ledger.tokenEstimate > settings.maxTokenBudgetPerLocation;

  const evidence = {
    ...input.rushEvidence,
    deferredForRush: input.deferredForRush,
    dbQueries: input.ledger.dbQueries,
    durationMs: input.ledger.durationMs,
    tokenEstimate: input.ledger.tokenEstimate,
    costEstimateUsd: Math.round(input.ledger.costEstimateUsd * 10_000) / 10_000,
    openBreakers: input.openBreakers,
    budgets: {
      maxDbQueriesPerLocation: settings.maxDbQueriesPerLocation,
      maxDurationMsPerLocation: settings.maxDurationMsPerLocation,
      maxTokenBudgetPerLocation: settings.maxTokenBudgetPerLocation,
    },
    overBudget,
  };

  if (input.deferredForRush) {
    await recordLoopRun({
      locationId: input.locationId,
      loopKind: "TOKEN_SAFEGUARD",
      year: input.year,
      weekNumber: input.weekNumber,
      metricName: "computeBudget",
      metricValue: input.ledger.durationMs,
      targetValue: settings.maxDurationMsPerLocation,
      deltaValue: input.ledger.durationMs - settings.maxDurationMsPerLocation,
      outcome: "NO_ACTION",
      evidence: { ...evidence, reason: "deferred_in_rush" },
    });
    return null;
  }

  if (input.openBreakers.length > 0 || overBudget) {
    await recordLoopRun({
      locationId: input.locationId,
      loopKind: "TOKEN_SAFEGUARD",
      year: input.year,
      weekNumber: input.weekNumber,
      metricName: "computeBudget",
      metricValue: input.ledger.durationMs,
      targetValue: settings.maxDurationMsPerLocation,
      deltaValue: input.ledger.durationMs - settings.maxDurationMsPerLocation,
      outcome: "FAILED",
      evidence: {
        ...evidence,
        reason: input.openBreakers.length > 0 ? "circuit_breaker_open" : "budget_exceeded",
      },
    });

    if (!settings.emitBudgetAlerts) return null;

    const proposed = {
      ...settings,
      // Suggest tighter caps when over budget (human must approve).
      maxDbQueriesPerLocation: Math.max(
        50,
        Math.floor(settings.maxDbQueriesPerLocation * 0.85),
      ),
      maxDurationMsPerLocation: Math.max(
        5_000,
        Math.floor(settings.maxDurationMsPerLocation * 0.85),
      ),
    };

    return {
      agentName: "TOKEN_SAFEGUARD",
      fingerprint: weekFingerprint("TOKEN_SAFEGUARD", input.year, input.weekNumber, "BUDGET"),
      currentConfig: { ...settings },
      proposedConfig: proposed,
      evidence,
      rationaleFr: `Safeguard Autopilot : ${input.openBreakers.length > 0 ? `disjoncteur ouvert (${input.openBreakers.join(", ")})` : "budget dépassé"} — ${input.ledger.dbQueries} req. DB / ${input.ledger.durationMs} ms / ~${input.ledger.tokenEstimate} tokens. Proposition de plafonds plus stricts (approbation humaine).`,
      rationaleEn: `Autopilot safeguard: ${input.openBreakers.length > 0 ? `breaker open (${input.openBreakers.join(", ")})` : "budget exceeded"} — ${input.ledger.dbQueries} DB queries / ${input.ledger.durationMs} ms / ~${input.ledger.tokenEstimate} tokens. Proposes tighter caps (human approval).`,
      rationaleEs: `Safeguard Autopilot: ${input.openBreakers.length > 0 ? `breaker abierto (${input.openBreakers.join(", ")})` : "presupuesto excedido"} — ${input.ledger.dbQueries} consultas / ${input.ledger.durationMs} ms / ~${input.ledger.tokenEstimate} tokens. Propone límites más estrictos.`,
    };
  }

  await recordLoopRun({
    locationId: input.locationId,
    loopKind: "TOKEN_SAFEGUARD",
    year: input.year,
    weekNumber: input.weekNumber,
    metricName: "computeBudget",
    metricValue: input.ledger.durationMs,
    targetValue: settings.maxDurationMsPerLocation,
    deltaValue: input.ledger.durationMs - settings.maxDurationMsPerLocation,
    outcome: "MEASURED",
    evidence,
  });

  return null;
}

function proposedSurgeBonus(config: Record<string, unknown>): number | null {
  const value = config.defaultSurgeBonus;
  return typeof value === "number" ? value : null;
}

function proposedWatchHours(config: Record<string, unknown>): number[] {
  if (!Array.isArray(config.watchHours)) return [];
  return config.watchHours.filter((h): h is number => typeof h === "number");
}

function proposedAssiduityHours(config: Record<string, unknown>): number[] {
  if (!Array.isArray(config.scheduleBuffers)) return [];
  return config.scheduleBuffers
    .map((row) =>
      typeof row === "object" && row && "startHour" in row && typeof row.startHour === "number"
        ? row.startHour
        : null,
    )
    .filter((h): h is number => h != null);
}

/**
 * Loop F — Drift-Guard: veto runaway raises, surface conflicts, emit decay proposals.
 */
export async function runDriftGuardLoop(
  locationId: string,
  year: number,
  weekNumber: number,
  candidates: PlaybookCandidate[],
  ledger?: AutopilotBudgetLedger,
): Promise<{ allowed: PlaybookCandidate[]; holds: PlaybookCandidate[]; decay: PlaybookCandidate | null }> {
  const settings = await getAgentPlaybookSettings(locationId, "DRIFT_GUARD");
  if (ledger) trackDbQuery(ledger, 1);

  const priorCodeRed = await prisma.autopilotLoopRun.findMany({
    where: { locationId, loopKind: "CODE_RED_SURGE" },
    orderBy: [{ year: "desc" }, { weekNumber: "desc" }],
    take: settings.decayStableWeeks + 1,
    select: { outcome: true, evidence: true, year: true, weekNumber: true },
  });
  if (ledger) trackDbQuery(ledger, 1);

  const priorRaise = await prisma.agentPlaybookProposal.findFirst({
    where: {
      locationId,
      agentName: "CODE_RED_SURGE",
      fingerprint: { contains: "SURGE_BONUS" },
      status: { in: ["SUGGESTED", "APPROVED"] },
      createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (ledger) trackDbQuery(ledger, 1);

  const laborHours = new Set<number>();
  const assiduityHours = new Set<number>();
  for (const c of candidates) {
    if (c.agentName === "LABOR_COST") {
      for (const h of proposedWatchHours(c.proposedConfig)) laborHours.add(h);
    }
    if (c.agentName === "ASSIDUITY") {
      for (const h of proposedAssiduityHours(c.proposedConfig)) assiduityHours.add(h);
    }
  }

  const conflictHours = [...laborHours].filter((h) => assiduityHours.has(h));

  const allowed: PlaybookCandidate[] = [];
  const holds: PlaybookCandidate[] = [];

  for (const candidate of candidates) {
    let holdReason: string | null = null;

    if (candidate.agentName === "CODE_RED_SURGE") {
      const current = proposedSurgeBonus(candidate.currentConfig) ?? 0;
      const next = proposedSurgeBonus(candidate.proposedConfig) ?? 0;
      if (next > current) {
        const pct = current > 0 ? ((next - current) / current) * 100 : 100;
        if (pct > settings.maxSingleStepPct) {
          holdReason = `rate_of_change_${Math.round(pct)}pct`;
        } else if (priorRaise && settings.blockConsecutiveRaises) {
          holdReason = "consecutive_surge_raise";
        }
      }
    }

    if (
      !holdReason &&
      candidate.agentName === "ASSIDUITY" &&
      conflictHours.length > 0 &&
      proposedAssiduityHours(candidate.proposedConfig).some((h) => conflictHours.includes(h))
    ) {
      holdReason = `cross_loop_conflict_hours_${conflictHours.join("_")}`;
    }

    if (holdReason) {
      holds.push({
        ...candidate,
        guardrailHold: true,
        evidence: {
          ...candidate.evidence,
          guardrailHold: true,
          holdReason,
          heldAgent: candidate.agentName,
          heldFingerprint: candidate.fingerprint,
        },
        fingerprint: weekFingerprint(
          "DRIFT_GUARD",
          year,
          weekNumber,
          `HOLD-${candidate.fingerprint.replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 40)}`,
        ),
        agentName: "DRIFT_GUARD",
        rationaleFr: `Autopilot s'est intercepté (${holdReason}) : proposition ${candidate.agentName} mise en garde (guardrail_hold) — validation humaine requise.`,
        rationaleEn: `Autopilot caught itself (${holdReason}): ${candidate.agentName} proposal held (guardrail_hold) — human review required.`,
        rationaleEs: `Autopilot se detuvo (${holdReason}): propuesta ${candidate.agentName} en guardrail_hold — revisión humana.`,
      });
      continue;
    }

    allowed.push(candidate);
  }

  // Decay: Code Red fills comfortable for M weeks → propose lowering defaultSurgeBonus.
  let decay: PlaybookCandidate | null = null;
  const surgeSettings = await getAgentPlaybookSettings(locationId, "CODE_RED_SURGE");
  if (ledger) trackDbQuery(ledger, 1);

  const stableWeeks = priorCodeRed.filter((row) => row.outcome === "NO_ACTION").length;
  const baseline = 2.5;
  if (
    settings.enableDecayProposals &&
    stableWeeks >= settings.decayStableWeeks &&
    surgeSettings.defaultSurgeBonus > baseline + 0.01
  ) {
    const nextBonus = Math.max(
      baseline,
      Math.round((surgeSettings.defaultSurgeBonus - 0.5) * 100) / 100,
    );
    if (nextBonus < surgeSettings.defaultSurgeBonus) {
      const proposed: CodeRedSurgePlaybookSettings = {
        ...surgeSettings,
        defaultSurgeBonus: nextBonus,
      };
      decay = {
        agentName: "CODE_RED_SURGE",
        fingerprint: weekFingerprint("DRIFT_GUARD", year, weekNumber, "SURGE_DECAY"),
        currentConfig: { ...surgeSettings },
        proposedConfig: { ...proposed },
        evidence: {
          guardrail: "decay",
          stableWeeks,
          fromBonus: surgeSettings.defaultSurgeBonus,
          toBonus: nextBonus,
        },
        rationaleFr: `Prime Code Rouge stable depuis ${stableWeeks} semaines in-band. Drift-Guard propose de ramener la prime par défaut de ${surgeSettings.defaultSurgeBonus.toFixed(2)} à ${nextBonus.toFixed(2)} $/h (retour à la moyenne).`,
        rationaleEn: `Code Red bonus in-band for ${stableWeeks} weeks. Drift-Guard proposes decaying default surge from ${surgeSettings.defaultSurgeBonus.toFixed(2)} to ${nextBonus.toFixed(2)}/hr.`,
        rationaleEs: `Prima Code Rouge estable ${stableWeeks} semanas. Drift-Guard propone bajar de ${surgeSettings.defaultSurgeBonus.toFixed(2)} a ${nextBonus.toFixed(2)} $/h.`,
      };
    }
  }

  await recordLoopRun({
    locationId,
    loopKind: "DRIFT_GUARD",
    year,
    weekNumber,
    metricName: "guardrailHolds",
    metricValue: holds.length,
    targetValue: 0,
    deltaValue: holds.length,
    outcome: holds.length > 0 || decay ? "PROPOSED" : "NO_ACTION",
    evidence: {
      holds: holds.map((h) => h.evidence),
      conflictHours,
      decayProposed: Boolean(decay),
      allowedCount: allowed.length,
      inputCandidates: candidates.length,
    },
  });

  return { allowed, holds, decay };
}

/** Probe rush + record TOKEN_SAFEGUARD deferral without running heavy loops. */
export async function evaluateRushGate(
  locationId: string,
  year: number,
  weekNumber: number,
  ledger: AutopilotBudgetLedger,
): Promise<{ deferred: boolean; evidence: Record<string, unknown> }> {
  const rush = await isLocationInRush(locationId);
  trackDbQuery(ledger, 1);
  if (!rush.inRush) return { deferred: false, evidence: rush.evidence };

  ledger.deferredForRush = true;
  await runTokenSafeguardLoop({
    locationId,
    year,
    weekNumber,
    ledger,
    deferredForRush: true,
    rushEvidence: rush.evidence,
    openBreakers: [],
  });
  return { deferred: true, evidence: rush.evidence };
}

export async function shouldSkipLoopForBreaker(
  locationId: string,
  loopKind: AutopilotLoopKind,
  year: number,
  weekNumber: number,
  ledger: AutopilotBudgetLedger,
): Promise<boolean> {
  const breaker = await getLoopCircuitBreaker(locationId, loopKind, year, weekNumber);
  trackDbQuery(ledger, 1);
  if (breaker.state !== "OPEN") return false;

  ledger.breakerTrips.push(loopKind);
  // Visible on dashboard without latching the breaker forever (no FAILED here).
  await recordLoopRun({
    locationId,
    loopKind,
    year,
    weekNumber,
    metricName: "circuitBreaker",
    metricValue: breaker.consecutiveFailures,
    targetValue: 3,
    deltaValue: breaker.consecutiveFailures,
    outcome: "FAILED",
    evidence: {
      breakerState: breaker.state,
      consecutiveFailures: breaker.consecutiveFailures,
      reason: "circuit_open_skip",
      degraded: true,
    },
  });
  return true;
}

export async function markLoopFailed(
  locationId: string,
  loopKind: AutopilotLoopKind,
  year: number,
  weekNumber: number,
  error: unknown,
) {
  await recordLoopRun({
    locationId,
    loopKind,
    year,
    weekNumber,
    metricName: "loopError",
    metricValue: null,
    outcome: "FAILED",
    evidence: {
      error: error instanceof Error ? error.message : String(error),
    },
  });
}

export { upsertPlaybookCandidate };
