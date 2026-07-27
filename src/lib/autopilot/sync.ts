import "server-only";

import type { AutopilotLoopKind, AutopilotLoopOutcome } from "@/generated/prisma/enums";
import type { Locale } from "@/lib/i18n/config";
import {
  AUTOPILOT_LOCATION_CONCURRENCY,
  AUTOPILOT_LOCATION_TIMEOUT_MS,
  createBudgetLedger,
  mapPool,
  withTimeout,
} from "@/lib/autopilot/governor";
import {
  evaluateRushGate,
  markLoopFailed,
  runAssiduityLoop,
  runDriftGuardLoop,
  runTokenSafeguardLoop,
  shouldSkipLoopForBreaker,
  upsertPlaybookCandidate,
} from "@/lib/autopilot/loops";
import {
  recordLoopRun,
  weekFingerprint,
  type PlaybookCandidate,
} from "@/lib/autopilot/record";
import { calculateLiveLaborKpis } from "@/lib/finance/labor-kpis";
import { prisma } from "@/lib/prisma";
import { getPulseWeekBounds, getPulseWeekParts } from "@/lib/pulse/week";
import {
  getAgentPlaybookSettings,
  type CodeRedSurgePlaybookSettings,
  type LaborCostPlaybookSettings,
  type PulseCulturePlaybookSettings,
} from "@/lib/rsi/playbooks";
import { syncWeeklyAgentPlaybookProposals } from "@/lib/rsi/agent-performance";

export type AutopilotLoopRunView = {
  id: string;
  loopKind: AutopilotLoopKind;
  metricName: string;
  metricValue: number | null;
  targetValue: number | null;
  deltaValue: number | null;
  outcome: AutopilotLoopOutcome;
  evidence: Record<string, unknown>;
  createdAt: string;
};

export type { PlaybookCandidate };

/** Boucle A — labor cost intraday vs cible ± tolérance. */
export async function runLaborCostLoop(
  locationId: string,
  year: number,
  weekNumber: number,
): Promise<PlaybookCandidate | null> {
  const settings = await getAgentPlaybookSettings(locationId, "LABOR_COST");
  const report = await calculateLiveLaborKpis({ locationId, targetDate: new Date() });
  const metric = report.liveLaborCostPercentage;
  const target = settings.targetLaborPct;
  const delta = metric - target;

  const slowHours = settings.watchHours.filter((hour) => {
    const bucket = report.buckets[hour];
    if (!bucket) return false;
    const sales = bucket.actualSales ?? bucket.projectedSales;
    if (sales <= 0) return bucket.laborHours > 0;
    const pct = (bucket.laborCost / sales) * 100;
    return pct > target + settings.tolerancePct;
  });

  const evidence = {
    liveLaborCostPct: Math.round(metric * 10) / 10,
    targetLaborPct: target,
    tolerancePct: settings.tolerancePct,
    status: report.liveLaborCostStatus,
    slowHours,
    weekNumber,
    year,
  };

  const outOfBand = Math.abs(delta) > settings.tolerancePct;

  if (!outOfBand && slowHours.length === 0) {
    await recordLoopRun({
      locationId,
      loopKind: "LABOR_COST",
      year,
      weekNumber,
      metricName: "liveLaborCostPercentage",
      metricValue: metric,
      targetValue: target,
      deltaValue: delta,
      outcome: "NO_ACTION",
      evidence,
    });
    return null;
  }

  await recordLoopRun({
    locationId,
    loopKind: "LABOR_COST",
    year,
    weekNumber,
    metricName: "liveLaborCostPercentage",
    metricValue: metric,
    targetValue: target,
    deltaValue: delta,
    outcome: "PROPOSED",
    evidence,
  });

  if (slowHours.length >= 2) {
    const proposed: LaborCostPlaybookSettings = {
      ...settings,
      watchHours: Array.from(new Set([...settings.watchHours, ...slowHours])).sort((a, b) => a - b),
    };
    return {
      agentName: "LABOR_COST",
      fingerprint: weekFingerprint("LABOR_COST", year, weekNumber, "WATCH_HOURS"),
      currentConfig: { ...settings },
      proposedConfig: { ...proposed },
      evidence,
      rationaleFr: `Labor cost à ${metric.toFixed(1)} % (cible ${target} ± ${settings.tolerancePct}). Sur-effectif détecté aux heures ${slowHours.join("h, ")}h. Autopilot propose d'élargir la surveillance et d'ajuster le gabarit de planification.`,
      rationaleEn: `Labor cost at ${metric.toFixed(1)}% (target ${target} ± ${settings.tolerancePct}). Overstaffing detected at hours ${slowHours.join("h, ")}h. Autopilot proposes widening watch hours and tuning schedule templates.`,
      rationaleEs: `Labor cost al ${metric.toFixed(1)} % (objetivo ${target} ± ${settings.tolerancePct}). Sobrestaffing en horas ${slowHours.join("h, ")}h. Autopilot propone ampliar vigilancia y ajustar plantillas.`,
    };
  }

  return null;
}

/** Boucle B — Code Rouge : apprendre la prime minimale pour comblement rapide. */
export async function runCodeRedSurgeLoop(
  locationId: string,
  year: number,
  weekNumber: number,
): Promise<PlaybookCandidate | null> {
  const settings = await getAgentPlaybookSettings(locationId, "CODE_RED_SURGE");
  const { start, end } = getPulseWeekBounds();

  const codeRedShifts = await prisma.shift.findMany({
    where: {
      locationId,
      urgency: "CODE_RED",
      codeRedAt: { gte: start, lt: end },
    },
    select: {
      id: true,
      codeRedAt: true,
      surgeBonus: true,
      employeeId: true,
      emergencyBids: {
        where: { status: "ACCEPTED" },
        select: { respondedAt: true, createdAt: true },
        take: 1,
      },
    },
  });

  const fills = codeRedShifts
    .map((shift) => {
      const bid = shift.emergencyBids[0];
      if (!shift.codeRedAt || !bid?.respondedAt) return null;
      const fillSeconds = (bid.respondedAt.getTime() - shift.codeRedAt.getTime()) / 1000;
      return {
        fillSeconds,
        surgeBonus: shift.surgeBonus ? Number(shift.surgeBonus) : settings.defaultSurgeBonus,
        filled: Boolean(shift.employeeId),
      };
    })
    .filter(Boolean) as { fillSeconds: number; surgeBonus: number; filled: boolean }[];

  const avgFill =
    fills.length > 0 ? fills.reduce((s, f) => s + f.fillSeconds, 0) / fills.length : null;

  const evidence = {
    codeRedEvents: codeRedShifts.length,
    fillsMeasured: fills.length,
    avgFillSeconds: avgFill != null ? Math.round(avgFill) : null,
    targetFillSeconds: settings.targetFillSeconds,
    weekNumber,
    year,
  };

  if (fills.length < 2) {
    await recordLoopRun({
      locationId,
      loopKind: "CODE_RED_SURGE",
      year,
      weekNumber,
      metricName: "avgFillSeconds",
      metricValue: avgFill,
      targetValue: settings.targetFillSeconds,
      deltaValue: avgFill != null ? avgFill - settings.targetFillSeconds : null,
      outcome: "NO_ACTION",
      evidence,
    });
    return null;
  }

  const slowFills = fills.filter((f) => f.fillSeconds > settings.targetFillSeconds);
  const fastFills = fills.filter((f) => f.fillSeconds <= settings.targetFillSeconds);

  if (slowFills.length === 0) {
    await recordLoopRun({
      locationId,
      loopKind: "CODE_RED_SURGE",
      year,
      weekNumber,
      metricName: "avgFillSeconds",
      metricValue: avgFill,
      targetValue: settings.targetFillSeconds,
      deltaValue: (avgFill ?? 0) - settings.targetFillSeconds,
      outcome: "NO_ACTION",
      evidence,
    });
    return null;
  }

  const avgSlowSurge =
    slowFills.reduce((s, f) => s + f.surgeBonus, 0) / Math.max(1, slowFills.length);
  const avgFastSurge =
    fastFills.length > 0
      ? fastFills.reduce((s, f) => s + f.surgeBonus, 0) / fastFills.length
      : settings.defaultSurgeBonus;

  const proposedBonus = Math.min(
    settings.maxSurgeBonus,
    Math.round((Math.max(avgSlowSurge, avgFastSurge) + 0.5) * 100) / 100,
  );

  if (proposedBonus <= settings.defaultSurgeBonus) {
    await recordLoopRun({
      locationId,
      loopKind: "CODE_RED_SURGE",
      year,
      weekNumber,
      metricName: "avgFillSeconds",
      metricValue: avgFill,
      targetValue: settings.targetFillSeconds,
      deltaValue: (avgFill ?? 0) - settings.targetFillSeconds,
      outcome: "MEASURED",
      evidence,
    });
    return null;
  }

  const proposed: CodeRedSurgePlaybookSettings = {
    ...settings,
    defaultSurgeBonus: proposedBonus,
  };

  await recordLoopRun({
    locationId,
    loopKind: "CODE_RED_SURGE",
    year,
    weekNumber,
    metricName: "avgFillSeconds",
    metricValue: avgFill,
    targetValue: settings.targetFillSeconds,
    deltaValue: (avgFill ?? 0) - settings.targetFillSeconds,
    outcome: "PROPOSED",
    evidence: { ...evidence, proposedBonus },
  });

  return {
    agentName: "CODE_RED_SURGE",
    fingerprint: weekFingerprint("CODE_RED_SURGE", year, weekNumber, "SURGE_BONUS"),
    currentConfig: { ...settings },
    proposedConfig: { ...proposed },
    evidence: { ...evidence, proposedBonus },
    rationaleFr: `${slowFills.length} Code Rouge comblés en > ${settings.targetFillSeconds}s cette semaine (moy. ${Math.round(avgFill ?? 0)}s). Autopilot propose une prime par défaut de ${proposedBonus.toFixed(2)} $/h (actuellement ${settings.defaultSurgeBonus.toFixed(2)} $/h).`,
    rationaleEn: `${slowFills.length} Code Red fills took > ${settings.targetFillSeconds}s this week (avg ${Math.round(avgFill ?? 0)}s). Autopilot proposes default surge ${proposedBonus.toFixed(2)}/hr (currently ${settings.defaultSurgeBonus.toFixed(2)}/hr).`,
    rationaleEs: `${slowFills.length} Code Rouge cubiertos en > ${settings.targetFillSeconds}s esta semana (prom. ${Math.round(avgFill ?? 0)}s). Autopilot propone prima ${proposedBonus.toFixed(2)} $/h (actual ${settings.defaultSurgeBonus.toFixed(2)} $/h).`,
  };
}

/** Boucle C — Pulse culture : cible score moyen + coaching station. */
export async function runPulseCultureLoop(
  locationId: string,
  year: number,
  weekNumber: number,
): Promise<PlaybookCandidate | null> {
  const settings = await getAgentPlaybookSettings(locationId, "PULSE_CULTURE");

  const pulseGroups = await prisma.pulseResponse.groupBy({
    by: ["stationId"],
    where: { locationId, year, weekNumber },
    _avg: { score: true },
    _count: { _all: true },
  });

  const totalResponses = pulseGroups.reduce((s, g) => s + (g._count._all ?? 0), 0);
  const overall =
    totalResponses === 0
      ? null
      : pulseGroups.reduce((s, g) => s + (g._avg.score ?? 0) * (g._count._all ?? 0), 0) /
        totalResponses;

  const lowStations = pulseGroups.filter(
    (g) => (g._count._all ?? 0) >= 2 && (g._avg.score ?? 0) < settings.targetPulseScore,
  );

  const evidence = {
    pulseOverall: overall != null ? Math.round(overall * 10) / 10 : null,
    targetPulseScore: settings.targetPulseScore,
    responseCount: totalResponses,
    lowStationCount: lowStations.length,
    weekNumber,
    year,
  };

  if (overall == null || overall >= settings.targetPulseScore) {
    await recordLoopRun({
      locationId,
      loopKind: "PULSE_CULTURE",
      year,
      weekNumber,
      metricName: "pulseOverall",
      metricValue: overall,
      targetValue: settings.targetPulseScore,
      deltaValue: overall != null ? overall - settings.targetPulseScore : null,
      outcome: "NO_ACTION",
      evidence,
    });
    return null;
  }

  await recordLoopRun({
    locationId,
    loopKind: "PULSE_CULTURE",
    year,
    weekNumber,
    metricName: "pulseOverall",
    metricValue: overall,
    targetValue: settings.targetPulseScore,
    deltaValue: overall - settings.targetPulseScore,
    outcome: "PROPOSED",
    evidence,
  });

  if (!settings.enableStationCoaching && lowStations.length >= 1) {
    const proposed: PulseCulturePlaybookSettings = {
      ...settings,
      enableStationCoaching: true,
    };
    return {
      agentName: "PULSE_CULTURE",
      fingerprint: weekFingerprint("PULSE_CULTURE", year, weekNumber, "STATION_COACHING"),
      currentConfig: { ...settings },
      proposedConfig: { ...proposed },
      evidence,
      rationaleFr: `Pulse moyen ${overall.toFixed(1)}/5 (cible ${settings.targetPulseScore}). ${lowStations.length} station(s) sous la cible. Autopilot propose d'activer le coaching station automatique post-quart.`,
      rationaleEn: `Average Pulse ${overall.toFixed(1)}/5 (target ${settings.targetPulseScore}). ${lowStations.length} station(s) below target. Autopilot proposes enabling automatic station coaching.`,
      rationaleEs: `Pulse promedio ${overall.toFixed(1)}/5 (objetivo ${settings.targetPulseScore}). ${lowStations.length} estación(es) bajo objetivo. Autopilot propone activar coaching de estación.`,
    };
  }

  return null;
}

type LoopRunner = {
  kind: AutopilotLoopKind;
  run: () => Promise<PlaybookCandidate | PlaybookCandidate[] | null>;
};

/**
 * Exécute les boucles Autopilot A–F pour une succursale (propose-only),
 * avec rush gate, circuit breakers et ledger compute/tokens.
 */
export async function syncWeeklyAutopilotLoops(locationId: string): Promise<number> {
  const { weekNumber, year } = getPulseWeekParts();
  const ledger = createBudgetLedger();
  const started = Date.now();
  let proposals = 0;

  const rush = await evaluateRushGate(locationId, year, weekNumber, ledger);
  if (rush.deferred) {
    await syncWeeklyAgentPlaybookProposals(locationId);
    return 0;
  }

  const runners: LoopRunner[] = [
    { kind: "LABOR_COST", run: () => runLaborCostLoop(locationId, year, weekNumber) },
    { kind: "CODE_RED_SURGE", run: () => runCodeRedSurgeLoop(locationId, year, weekNumber) },
    { kind: "PULSE_CULTURE", run: () => runPulseCultureLoop(locationId, year, weekNumber) },
    { kind: "ASSIDUITY", run: () => runAssiduityLoop(locationId, year, weekNumber, ledger) },
  ];

  const candidates: PlaybookCandidate[] = [];

  for (const runner of runners) {
    if (await shouldSkipLoopForBreaker(locationId, runner.kind, year, weekNumber, ledger)) {
      continue;
    }
    try {
      const result = await withTimeout(
        runner.run(),
        AUTOPILOT_LOCATION_TIMEOUT_MS,
        `${locationId}:${runner.kind}`,
      );
      if (!result) continue;
      if (Array.isArray(result)) candidates.push(...result);
      else candidates.push(result);
    } catch (error) {
      console.error("[mirok:autopilot]", locationId, runner.kind, error);
      await markLoopFailed(locationId, runner.kind, year, weekNumber, error);
      ledger.breakerTrips.push(runner.kind);
    }
  }

  // Loop F — audit sibling proposals before surface.
  let toUpsert = candidates;
  try {
    if (!(await shouldSkipLoopForBreaker(locationId, "DRIFT_GUARD", year, weekNumber, ledger))) {
      const guarded = await withTimeout(
        runDriftGuardLoop(locationId, year, weekNumber, candidates, ledger),
        AUTOPILOT_LOCATION_TIMEOUT_MS,
        `${locationId}:DRIFT_GUARD`,
      );
      toUpsert = [...guarded.allowed];
      if (guarded.decay) toUpsert.push(guarded.decay);
      for (const hold of guarded.holds) {
        if (await upsertPlaybookCandidate(locationId, hold)) proposals += 1;
      }
    }
  } catch (error) {
    console.error("[mirok:autopilot]", locationId, "DRIFT_GUARD", error);
    await markLoopFailed(locationId, "DRIFT_GUARD", year, weekNumber, error);
    ledger.breakerTrips.push("DRIFT_GUARD");
  }

  for (const candidate of toUpsert) {
    if (await upsertPlaybookCandidate(locationId, candidate)) {
      proposals += 1;
    }
  }

  ledger.durationMs = Date.now() - started;

  try {
    const safeguard = await runTokenSafeguardLoop({
      locationId,
      year,
      weekNumber,
      ledger,
      deferredForRush: false,
      openBreakers: [...new Set(ledger.breakerTrips)],
    });
    if (safeguard && (await upsertPlaybookCandidate(locationId, safeguard))) {
      proposals += 1;
    }
  } catch (error) {
    console.error("[mirok:autopilot]", locationId, "TOKEN_SAFEGUARD", error);
    await markLoopFailed(locationId, "TOKEN_SAFEGUARD", year, weekNumber, error);
  }

  await syncWeeklyAgentPlaybookProposals(locationId);
  return proposals;
}

export async function syncAutopilotForAllLocations(): Promise<{
  locations: number;
  proposals: number;
}> {
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const results = await mapPool(locations, AUTOPILOT_LOCATION_CONCURRENCY, async (loc) => {
    try {
      return await withTimeout(
        syncWeeklyAutopilotLoops(loc.id),
        AUTOPILOT_LOCATION_TIMEOUT_MS,
        `location:${loc.id}`,
      );
    } catch (error) {
      console.error("[mirok:autopilot:location]", loc.id, error);
      return 0;
    }
  });

  return {
    locations: locations.length,
    proposals: results.reduce((sum, n) => sum + n, 0),
  };
}

export async function getRecentAutopilotRuns(
  locationId: string,
  limit = 6,
): Promise<AutopilotLoopRunView[]> {
  const rows = await prisma.autopilotLoopRun.findMany({
    where: { locationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    loopKind: row.loopKind,
    metricName: row.metricName,
    metricValue: row.metricValue != null ? Number(row.metricValue) : null,
    targetValue: row.targetValue != null ? Number(row.targetValue) : null,
    deltaValue: row.deltaValue != null ? Number(row.deltaValue) : null,
    outcome: row.outcome,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function autopilotLoopLabel(kind: AutopilotLoopKind, lang: Locale): string {
  const labels: Record<AutopilotLoopKind, Record<Locale, string>> = {
    LABOR_COST: {
      fr: "Labor cost",
      en: "Labor cost",
      es: "Costo laboral",
    },
    CODE_RED_SURGE: {
      fr: "Code Rouge · prime",
      en: "Code Red · surge",
      es: "Code Rouge · prima",
    },
    PULSE_CULTURE: {
      fr: "Pulse · culture",
      en: "Pulse · culture",
      es: "Pulse · cultura",
    },
    ASSIDUITY: {
      fr: "Assiduité · tampon",
      en: "Assiduity · buffer",
      es: "Asiduidad · buffer",
    },
    TOKEN_SAFEGUARD: {
      fr: "Safeguard · budget",
      en: "Safeguard · budget",
      es: "Safeguard · presupuesto",
    },
    DRIFT_GUARD: {
      fr: "Drift-Guard",
      en: "Drift-Guard",
      es: "Drift-Guard",
    },
  };
  return labels[kind][lang] ?? kind;
}
