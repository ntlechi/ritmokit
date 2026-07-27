import "server-only";

import type { AutopilotLoopKind } from "@/generated/prisma/enums";
import { calculateLiveLaborKpis } from "@/lib/finance/labor-kpis";
import { prisma } from "@/lib/prisma";

export const AUTOPILOT_LOCATION_CONCURRENCY = 3;
export const AUTOPILOT_LOCATION_TIMEOUT_MS = 45_000;
export const AUTOPILOT_BREAKER_FAILURE_THRESHOLD = 3;

/** Per-location cost ledger (DB ops + duration + future tokens). */
export type AutopilotBudgetLedger = {
  dbQueries: number;
  durationMs: number;
  tokenEstimate: number;
  costEstimateUsd: number;
  deferredForRush: boolean;
  breakerTrips: string[];
};

export function createBudgetLedger(): AutopilotBudgetLedger {
  return {
    dbQueries: 0,
    durationMs: 0,
    tokenEstimate: 0,
    costEstimateUsd: 0,
    deferredForRush: false,
    breakerTrips: [],
  };
}

export function trackDbQuery(ledger: AutopilotBudgetLedger, count = 1) {
  ledger.dbQueries += count;
}

export function trackTokens(ledger: AutopilotBudgetLedger, tokens: number, usdPerMillion = 3) {
  ledger.tokenEstimate += tokens;
  ledger.costEstimateUsd += (tokens / 1_000_000) * usdPerMillion;
}

/** Live rush gate — defer heavy Autopilot work during a POS/punch peak. */
export async function isLocationInRush(locationId: string): Promise<{
  inRush: boolean;
  evidence: Record<string, unknown>;
}> {
  const report = await calculateLiveLaborKpis({ locationId, targetDate: new Date() });
  const bucket = report.buckets[report.currentHour];
  const actual = bucket?.actualSales ?? null;
  const projected = bucket?.projectedSales ?? 0;
  const salesSurge =
    actual != null && projected > 0 ? actual / projected >= 1.25 : false;
  const pressure =
    report.liveLaborCostStatus === "critical" ||
    (report.liveLaborCostStatus === "warning" && salesSurge);

  const inRush = Boolean(report.isToday && report.hasPosData && pressure);

  return {
    inRush,
    evidence: {
      inRush,
      isToday: report.isToday,
      hasPosData: report.hasPosData,
      currentHour: report.currentHour,
      liveLaborCostStatus: report.liveLaborCostStatus,
      liveLaborCostPct: Math.round(report.liveLaborCostPercentage * 10) / 10,
      currentHourActualSales: actual,
      currentHourProjectedSales: projected,
      salesSurge,
    },
  };
}

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** Circuit breaker from recent FAILED AutopilotLoopRun rows for a loop. */
export async function getLoopCircuitBreaker(
  locationId: string,
  loopKind: AutopilotLoopKind,
  year: number,
  weekNumber: number,
): Promise<{ state: BreakerState; consecutiveFailures: number }> {
  const recent = await prisma.autopilotLoopRun.findMany({
    where: { locationId, loopKind },
    orderBy: [{ year: "desc" }, { weekNumber: "desc" }, { createdAt: "desc" }],
    take: AUTOPILOT_BREAKER_FAILURE_THRESHOLD,
    select: { outcome: true, year: true, weekNumber: true },
  });

  let consecutiveFailures = 0;
  for (const row of recent) {
    if (row.outcome === "FAILED") consecutiveFailures += 1;
    else break;
  }

  if (consecutiveFailures >= AUTOPILOT_BREAKER_FAILURE_THRESHOLD) {
    const latest = recent[0]!;
    // New ISO week → half-open probe (one attempt) instead of staying latched open.
    if (latest.year !== year || latest.weekNumber !== weekNumber) {
      return { state: "HALF_OPEN", consecutiveFailures };
    }
    return { state: "OPEN", consecutiveFailures };
  }
  if (consecutiveFailures > 0) {
    return { state: "HALF_OPEN", consecutiveFailures };
  }
  return { state: "CLOSED", consecutiveFailures: 0 };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout:${label}:${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Bounded concurrency pool for location-level Autopilot sync. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}
