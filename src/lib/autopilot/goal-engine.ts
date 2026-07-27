import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { GoalDirection, GoalState } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  addCivilDays,
  civilDateString,
  civilDateToUtcDate,
  civilDaysBetween,
  civilDaysDelta,
  locationTimeZone,
} from "@/lib/time/location-timezone";

/** Versioned transition playbook — stamped on every GoalTacticalLog row. */
export const GOAL_ACTION_VERSION = "goal-playbook-v1";

/** Debounce bands for Δ (progress − linear pace). */
export const GOAL_EPSILON = 0.05;
export const GOAL_DELTA = 0.15;
/** RDR above this + deep negative drift ⇒ OFF_TRACK. */
export const GOAL_RDR_FEASIBILITY_CEILING = 2.5;
/** |r_obs| below this while work remains ⇒ STALLED. */
export const GOAL_STALL_RATE_EPSILON = 1e-6;
/** Trailing window (civil days) for observed velocity. */
export const GOAL_OBS_WINDOW_DAYS = 7;

export type GoalScriptAction =
  | "notify_owner"
  | "propose_highest_leverage_lever"
  | "escalate_owner"
  | "freeze_competing_experiments"
  | "schedule_recovery_huddle"
  | "celebrate_close"
  | "postmortem_required"
  | "unblock_diagnosis"
  | "maintain_course"
  | "no_op";

export type GoalScript = {
  actions: GoalScriptAction[];
  transition: string;
  pendingState: GoalState | null;
  proseKey: string;
};

export type GoalTrajectoryInput = {
  currentValue: number;
  startValue: number;
  targetValue: number;
  direction: GoalDirection;
  startedAt: Date;
  deadlineAt: Date;
  locationId: string;
  /** Injected clock — never hidden Date.now() inside pure eval. */
  now: Date;
  /** Prior durable state (for hysteresis). */
  priorState: GoalState | null;
  /** Pending state from previous evaluation awaiting confirmation. */
  priorPendingState: GoalState | null;
  /** Current value ~w days ago (for r_obs); falls back to startValue. */
  priorWindowValue: number | null;
  priorWindowDay: string | null;
};

export type GoalTrajectoryResult = {
  evaluationDay: string;
  currentValue: number;
  startValue: number;
  targetValue: number;
  progress: number;
  tau: number;
  drift: number;
  remainingWork: number;
  remainingCivilDays: number;
  requiredDailyRate: number | null;
  observedDailyRate: number | null;
  rateDeficitRatio: number | null;
  projectedDeadline: string | null;
  rawState: GoalState;
  state: GoalState;
  priorState: GoalState | null;
  actionVersion: typeof GOAL_ACTION_VERSION;
  script: GoalScript;
};

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Normalized progress p(t) ∈ ℝ — 1.0 = achieved; <0 if regressing. */
export function computeProgress(
  current: number,
  start: number,
  target: number,
  direction: GoalDirection,
): number {
  const span = direction === "INCREASE" ? target - start : start - target;
  if (Math.abs(span) < 1e-12) {
    return isAchieved(current, target, direction) ? 1 : 0;
  }
  return direction === "INCREASE" ? (current - start) / span : (start - current) / span;
}

export function isAchieved(current: number, target: number, direction: GoalDirection): boolean {
  return direction === "INCREASE" ? current >= target : current <= target;
}

export function remainingWork(
  current: number,
  target: number,
  direction: GoalDirection,
): number {
  return direction === "INCREASE" ? target - current : current - target;
}

/**
 * Pure state selector — (Δ, RDR, τ, remaining…) → GoalState.
 * Terminal ACHIEVED / BREACHED / STALLED checked first.
 */
export function selectGoalState(input: {
  achieved: boolean;
  remainingCivilDays: number;
  drift: number;
  rateDeficitRatio: number | null;
  observedDailyRate: number | null;
  remainingWork: number;
  epsilon?: number;
  delta?: number;
  rdrCeiling?: number;
  stallEpsilon?: number;
}): GoalState {
  const epsilon = input.epsilon ?? GOAL_EPSILON;
  const delta = input.delta ?? GOAL_DELTA;
  const rdrCeiling = input.rdrCeiling ?? GOAL_RDR_FEASIBILITY_CEILING;
  const stallEpsilon = input.stallEpsilon ?? GOAL_STALL_RATE_EPSILON;

  if (input.achieved) return "ACHIEVED";
  if (input.remainingCivilDays < 0) return "BREACHED";

  const stalled =
    input.remainingWork > stallEpsilon &&
    input.remainingCivilDays > 0 &&
    (input.observedDailyRate == null || Math.abs(input.observedDailyRate) <= stallEpsilon);

  if (stalled) return "STALLED";

  const rdr = input.rateDeficitRatio;
  const onPace = rdr == null ? false : rdr <= 1;
  if (input.drift >= -epsilon || onPace) return "ON_TRACK";

  if (input.drift < -delta && rdr != null && rdr > rdrCeiling) return "OFF_TRACK";
  if (input.drift < -delta) return "OFF_TRACK";

  // −δ ≤ Δ < −ε
  if (input.drift >= -delta && input.drift < -epsilon) return "AT_RISK";

  return "AT_RISK";
}

/**
 * Hysteresis: non-terminal state changes require two consecutive evaluations
 * agreeing on the new state (pendingState confirmation).
 */
export function applyStateHysteresis(
  rawState: GoalState,
  priorState: GoalState | null,
  priorPendingState: GoalState | null,
): { state: GoalState; pendingState: GoalState | null } {
  const terminal: GoalState[] = ["ACHIEVED", "BREACHED", "STALLED"];
  if (!priorState) return { state: rawState, pendingState: null };
  if (rawState === priorState) return { state: rawState, pendingState: null };
  if (terminal.includes(rawState)) return { state: rawState, pendingState: null };

  if (priorPendingState === rawState) {
    return { state: rawState, pendingState: null };
  }
  return { state: priorState, pendingState: rawState };
}

/** Fixed transition → actions table (LLM may only phrase prose later). */
export function scriptForTransition(
  priorState: GoalState | null,
  state: GoalState,
  pendingState: GoalState | null,
): GoalScript {
  const transition = `${priorState ?? "NONE"}→${state}`;
  const table: Record<string, GoalScriptAction[]> = {
    "NONE→ON_TRACK": ["maintain_course"],
    "NONE→AT_RISK": ["notify_owner", "propose_highest_leverage_lever"],
    "NONE→OFF_TRACK": ["escalate_owner", "schedule_recovery_huddle", "propose_highest_leverage_lever"],
    "NONE→ACHIEVED": ["celebrate_close"],
    "NONE→BREACHED": ["postmortem_required"],
    "NONE→STALLED": ["unblock_diagnosis", "notify_owner"],
    "ON_TRACK→AT_RISK": ["notify_owner", "propose_highest_leverage_lever"],
    "ON_TRACK→OFF_TRACK": ["escalate_owner", "freeze_competing_experiments", "schedule_recovery_huddle"],
    "ON_TRACK→STALLED": ["unblock_diagnosis", "notify_owner"],
    "ON_TRACK→ACHIEVED": ["celebrate_close"],
    "ON_TRACK→BREACHED": ["postmortem_required"],
    "AT_RISK→ON_TRACK": ["maintain_course"],
    "AT_RISK→OFF_TRACK": ["escalate_owner", "freeze_competing_experiments", "schedule_recovery_huddle"],
    "AT_RISK→STALLED": ["unblock_diagnosis", "notify_owner"],
    "AT_RISK→ACHIEVED": ["celebrate_close"],
    "AT_RISK→BREACHED": ["postmortem_required"],
    "OFF_TRACK→AT_RISK": ["notify_owner", "propose_highest_leverage_lever"],
    "OFF_TRACK→ON_TRACK": ["maintain_course"],
    "OFF_TRACK→STALLED": ["unblock_diagnosis", "escalate_owner"],
    "OFF_TRACK→ACHIEVED": ["celebrate_close"],
    "OFF_TRACK→BREACHED": ["postmortem_required"],
    "STALLED→ON_TRACK": ["maintain_course"],
    "STALLED→AT_RISK": ["notify_owner", "propose_highest_leverage_lever"],
    "STALLED→OFF_TRACK": ["escalate_owner", "schedule_recovery_huddle"],
    "STALLED→ACHIEVED": ["celebrate_close"],
    "STALLED→BREACHED": ["postmortem_required"],
  };

  const actions = table[transition] ?? (priorState === state ? ["maintain_course"] : ["no_op"]);

  return {
    actions,
    transition,
    pendingState,
    proseKey: `goal.script.${transition}`,
  };
}

/**
 * Pure trajectory evaluator — deterministic given `now` and frozen inputs.
 * No DB, no hidden clocks.
 */
export function evaluateGoalTrajectory(input: GoalTrajectoryInput): GoalTrajectoryResult {
  const timeZone = locationTimeZone(input.locationId);
  const evaluationDay = civilDateString(input.now, timeZone);
  const deadlineDay = civilDateString(input.deadlineAt, timeZone);

  const totalDays = Math.max(1, civilDaysBetween(input.startedAt, input.deadlineAt, timeZone));
  const elapsedDays = civilDaysBetween(input.startedAt, input.now, timeZone);
  const tau = clamp01(elapsedDays / totalDays);

  const progress = computeProgress(
    input.currentValue,
    input.startValue,
    input.targetValue,
    input.direction,
  );
  const drift = progress - tau;

  const remaining = remainingWork(input.currentValue, input.targetValue, input.direction);
  const remainingCivilDays = civilDaysDelta(
    civilDateToUtcDate(evaluationDay),
    civilDateToUtcDate(deadlineDay),
    "UTC",
  );

  const achieved = isAchieved(input.currentValue, input.targetValue, input.direction);

  // Observed velocity over trailing window (or since start).
  let observedDailyRate: number | null = null;
  if (input.priorWindowValue != null && input.priorWindowDay) {
    const w = Math.max(
      1,
      civilDaysDelta(
        civilDateToUtcDate(input.priorWindowDay),
        civilDateToUtcDate(evaluationDay),
        "UTC",
      ),
    );
    const workDone =
      input.direction === "INCREASE"
        ? input.currentValue - input.priorWindowValue
        : input.priorWindowValue - input.currentValue;
    observedDailyRate = workDone / w;
  } else if (elapsedDays > 0) {
    const workDone =
      input.direction === "INCREASE"
        ? input.currentValue - input.startValue
        : input.startValue - input.currentValue;
    observedDailyRate = workDone / elapsedDays;
  } else {
    observedDailyRate = 0;
  }

  let requiredDailyRate: number | null = null;
  let rateDeficitRatio: number | null = null;
  let projectedDeadline: string | null = null;

  if (!achieved && remainingCivilDays > 0) {
    requiredDailyRate = remaining / remainingCivilDays;
    if (
      observedDailyRate != null &&
      Math.abs(observedDailyRate) > GOAL_STALL_RATE_EPSILON
    ) {
      rateDeficitRatio = requiredDailyRate / observedDailyRate;
      const daysNeeded = remaining / observedDailyRate;
      if (Number.isFinite(daysNeeded) && daysNeeded >= 0) {
        projectedDeadline = addCivilDays(evaluationDay, Math.ceil(daysNeeded));
      }
    }
  }

  const rawState = selectGoalState({
    achieved,
    remainingCivilDays,
    drift,
    rateDeficitRatio,
    observedDailyRate,
    remainingWork: remaining,
  });

  const { state, pendingState } = applyStateHysteresis(
    rawState,
    input.priorState,
    input.priorPendingState,
  );

  const script = scriptForTransition(input.priorState, state, pendingState);

  return {
    evaluationDay,
    currentValue: input.currentValue,
    startValue: input.startValue,
    targetValue: input.targetValue,
    progress,
    tau,
    drift,
    remainingWork: remaining,
    remainingCivilDays,
    requiredDailyRate,
    observedDailyRate,
    rateDeficitRatio,
    projectedDeadline,
    rawState,
    state,
    priorState: input.priorState,
    actionVersion: GOAL_ACTION_VERSION,
    script: {
      ...script,
      // Freeze decision snapshot inside script for bit-identical audits.
      // (Typed as GoalScript; extra fields live alongside in persisted JSON.)
    },
  };
}

function asNumber(value: { toString(): string } | number): number {
  return typeof value === "number" ? value : Number(value);
}

function readPendingState(script: unknown): GoalState | null {
  if (typeof script !== "object" || script == null || Array.isArray(script)) return null;
  const pending = (script as { pendingState?: unknown }).pendingState;
  const allowed: GoalState[] = [
    "ON_TRACK",
    "AT_RISK",
    "OFF_TRACK",
    "ACHIEVED",
    "BREACHED",
    "STALLED",
  ];
  return typeof pending === "string" && (allowed as string[]).includes(pending)
    ? (pending as GoalState)
    : null;
}

/**
 * Evaluate one OperationalGoal and upsert today's GoalTacticalLog (idempotent).
 */
export async function evaluateOperationalGoal(
  goalId: string,
  now: Date = new Date(),
): Promise<GoalTrajectoryResult | null> {
  const goal = await prisma.operationalGoal.findUnique({
    where: { id: goalId },
  });
  if (!goal || !goal.isActive) return null;

  const timeZone = locationTimeZone(goal.locationId);
  const evaluationDay = civilDateString(now, timeZone);
  const windowDay = addCivilDays(evaluationDay, -GOAL_OBS_WINDOW_DAYS);

  const [latestLog, windowLog] = await Promise.all([
    prisma.goalTacticalLog.findFirst({
      where: { goalId: goal.id },
      orderBy: { evaluationDay: "desc" },
    }),
    prisma.goalTacticalLog.findFirst({
      where: {
        goalId: goal.id,
        evaluationDay: { lte: civilDateToUtcDate(windowDay) },
      },
      orderBy: { evaluationDay: "desc" },
    }),
  ]);

  // Prefer yesterday's log as prior for hysteresis when re-running same day.
  const priorForHysteresis =
    latestLog && civilDateString(latestLog.evaluationDay, "UTC") === evaluationDay
      ? await prisma.goalTacticalLog.findFirst({
          where: {
            goalId: goal.id,
            evaluationDay: { lt: civilDateToUtcDate(evaluationDay) },
          },
          orderBy: { evaluationDay: "desc" },
        })
      : latestLog;

  const result = evaluateGoalTrajectory({
    currentValue: asNumber(goal.currentValue),
    startValue: asNumber(goal.startValue),
    targetValue: asNumber(goal.targetValue),
    direction: goal.direction,
    startedAt: goal.startedAt,
    deadlineAt: goal.deadlineAt,
    locationId: goal.locationId,
    now,
    priorState: priorForHysteresis?.state ?? null,
    priorPendingState: priorForHysteresis ? readPendingState(priorForHysteresis.script) : null,
    priorWindowValue: windowLog ? asNumber(windowLog.currentValue) : null,
    priorWindowDay: windowLog
      ? civilDateString(windowLog.evaluationDay, "UTC")
      : null,
  });

  const frozenScript = {
    ...result.script,
    snapshot: {
      c: result.currentValue,
      s: result.startValue,
      T: result.targetValue,
      progress: result.progress,
      tau: result.tau,
      drift: result.drift,
      RDR: result.rateDeficitRatio,
      r_req: result.requiredDailyRate,
      r_obs: result.observedDailyRate,
      remainingWork: result.remainingWork,
      remainingCivilDays: result.remainingCivilDays,
      D_proj: result.projectedDeadline,
      rawState: result.rawState,
      state: result.state,
      priorState: result.priorState,
    },
  };

  await prisma.goalTacticalLog.upsert({
    where: {
      goalId_evaluationDay: {
        goalId: goal.id,
        evaluationDay: civilDateToUtcDate(result.evaluationDay),
      },
    },
    update: {
      currentValue: result.currentValue,
      startValue: result.startValue,
      targetValue: result.targetValue,
      tau: result.tau,
      drift: result.drift,
      rateDeficitRatio: result.rateDeficitRatio,
      projectedDeadline: result.projectedDeadline
        ? civilDateToUtcDate(result.projectedDeadline)
        : null,
      state: result.state,
      priorState: result.priorState,
      actionVersion: result.actionVersion,
      script: frozenScript as Prisma.InputJsonValue,
    },
    create: {
      goalId: goal.id,
      evaluationDay: civilDateToUtcDate(result.evaluationDay),
      currentValue: result.currentValue,
      startValue: result.startValue,
      targetValue: result.targetValue,
      tau: result.tau,
      drift: result.drift,
      rateDeficitRatio: result.rateDeficitRatio,
      projectedDeadline: result.projectedDeadline
        ? civilDateToUtcDate(result.projectedDeadline)
        : null,
      state: result.state,
      priorState: result.priorState,
      actionVersion: result.actionVersion,
      script: frozenScript as Prisma.InputJsonValue,
    },
  });

  return result;
}

export async function syncOperationalGoalsForLocation(
  locationId: string,
  now: Date = new Date(),
): Promise<{ evaluated: number; atRisk: number; offTrack: number }> {
  const goals = await prisma.operationalGoal.findMany({
    where: { locationId, isActive: true },
    select: { id: true },
  });

  let evaluated = 0;
  let atRisk = 0;
  let offTrack = 0;

  for (const goal of goals) {
    const result = await evaluateOperationalGoal(goal.id, now);
    if (!result) continue;
    evaluated += 1;
    if (result.state === "AT_RISK") atRisk += 1;
    if (result.state === "OFF_TRACK" || result.state === "BREACHED" || result.state === "STALLED") {
      offTrack += 1;
    }
  }

  return { evaluated, atRisk, offTrack };
}

export async function syncOperationalGoalsForAllLocations(
  now: Date = new Date(),
): Promise<{ locations: number; evaluated: number; atRisk: number; offTrack: number }> {
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let evaluated = 0;
  let atRisk = 0;
  let offTrack = 0;

  for (const loc of locations) {
    const stats = await syncOperationalGoalsForLocation(loc.id, now);
    evaluated += stats.evaluated;
    atRisk += stats.atRisk;
    offTrack += stats.offTrack;
  }

  return { locations: locations.length, evaluated, atRisk, offTrack };
}
