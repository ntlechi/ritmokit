import type { DanceRole } from "@/generated/prisma/enums";
import { isSocialEvent } from "@/lib/dance/door-search";

/** Max |leads − follows| a class may reach; the fuller side waitlists past it. */
export const DEFAULT_MAX_IMBALANCE = 2;

/**
 * Threshold for a given course: socials, practicas and parties have no
 * lead/follow pedagogy, so the gap is never enforced there.
 */
export function maxImbalanceForCourse(course: { style: string; title: string }): number {
  return isSocialEvent(course.style, course.title) ? Infinity : DEFAULT_MAX_IMBALANCE;
}

export type RoleCapacity = {
  maxLeads: number;
  maxFollows: number;
  filledLeads: number;
  filledFollows: number;
  /**
   * Seated SOLO dancers (fitness, yoga, solo latin). They draw from the shared
   * pool `maxLeads + maxFollows` without touching the lead/follow gap.
   */
  filledSolos?: number;
  /**
   * Per-session gap threshold (see `maxImbalanceForCourse`). Capacity loaders
   * set it; when absent the engine falls back to `DEFAULT_MAX_IMBALANCE`.
   */
  maxImbalance?: number;
};

function thresholdFor(cap: RoleCapacity, override?: number): number {
  return override ?? cap.maxImbalance ?? DEFAULT_MAX_IMBALANCE;
}

export type ParityDecision =
  | { ok: true; waitlisted: false }
  | { ok: true; waitlisted: true; reason: "role_full" | "imbalance" }
  | { ok: false; reason: "role_full" | "imbalance" | "solo_not_supported"; waitlisted: false };

export type ClassAvailability = {
  leadsFree: number;
  followsFree: number;
  leadsFilled: number;
  followsFilled: number;
  maxLeads: number;
  maxFollows: number;
  full: boolean;
  imbalance: number;
};

/** Seats left in the whole room once every role (incl. SOLO) is counted. */
export function poolFree(cap: RoleCapacity): number {
  return Math.max(
    0,
    cap.maxLeads + cap.maxFollows - cap.filledLeads - cap.filledFollows - (cap.filledSolos ?? 0),
  );
}

export function getClassAvailability(cap: RoleCapacity): ClassAvailability {
  const pool = poolFree(cap);
  // A role seat only exists if the shared pool still has room for it.
  const leadsFree = Math.min(pool, Math.max(0, cap.maxLeads - cap.filledLeads));
  const followsFree = Math.min(pool, Math.max(0, cap.maxFollows - cap.filledFollows));
  return {
    leadsFree,
    followsFree,
    leadsFilled: cap.filledLeads,
    followsFilled: cap.filledFollows,
    maxLeads: cap.maxLeads,
    maxFollows: cap.maxFollows,
    full: pool <= 0 || (leadsFree <= 0 && followsFree <= 0),
    imbalance: Math.abs(cap.filledLeads - cap.filledFollows),
  };
}

/**
 * Which role, if any, the parity engine currently diverts to its own waitlist.
 *
 * A role is locked when seating one more of it would push |leads − follows|
 * above `maxImbalance` *and* that role is the surplus side. The smaller side
 * is never locked — every enrollment that shrinks the gap is welcome, which is
 * exactly how a locked room unlocks itself. Pass `Infinity` to disable
 * (socials / practicas where roles are cosmetic).
 */
export function getParityLock(
  cap: RoleCapacity,
  maxImbalanceOverride?: number,
): Extract<DanceRole, "LEAD" | "FOLLOW"> | null {
  const maxImbalance = thresholdFor(cap, maxImbalanceOverride);
  if (!Number.isFinite(maxImbalance)) return null;
  const nextLeadGap = cap.filledLeads + 1 - cap.filledFollows;
  if (nextLeadGap > maxImbalance) return "LEAD";
  const nextFollowGap = cap.filledFollows + 1 - cap.filledLeads;
  if (nextFollowGap > maxImbalance) return "FOLLOW";
  return null;
}

/**
 * Seat check for `role`.
 *
 * Order of decisions:
 * 1. Role pool full (or full solo pool) → `role_full`.
 * 2. Seating this role would breach `maxImbalance` on the surplus side →
 *    `imbalance`. Only the surplus role is affected; the other role keeps
 *    enrolling, and each of those enrollments releases the lock.
 * Both outcomes waitlist when `allowWaitlist` (default) and refuse otherwise.
 */
export function evaluateParityEnrollment(
  cap: RoleCapacity,
  role: DanceRole,
  options?: { maxImbalance?: number; allowWaitlist?: boolean },
): ParityDecision {
  const allowWaitlist = options?.allowWaitlist ?? true;
  const maxImbalance = thresholdFor(cap, options?.maxImbalance);
  const divert = (reason: "role_full" | "imbalance"): ParityDecision =>
    allowWaitlist
      ? { ok: true, waitlisted: true, reason }
      : { ok: false, reason, waitlisted: false };

  if (role === "SOLO") {
    if (poolFree(cap) <= 0) return divert("role_full");
    return { ok: true, waitlisted: false };
  }

  const avail = getClassAvailability(cap);
  const free = role === "LEAD" ? avail.leadsFree : avail.followsFree;
  if (free <= 0) return divert("role_full");

  if (getParityLock(cap, maxImbalance) === role) return divert("imbalance");

  return { ok: true, waitlisted: false };
}

/**
 * A couple needs one free Lead seat and one free Follow seat.
 */
export function evaluateCoupleEnrollment(cap: RoleCapacity): ParityDecision {
  const avail = getClassAvailability(cap);
  if (avail.leadsFree < 1 || avail.followsFree < 1) {
    return { ok: false, reason: "role_full", waitlisted: false };
  }
  return { ok: true, waitlisted: false };
}

/**
 * True when the seated mix is already past `maxImbalance` — an operator alert
 * (the room is uneven *now*). Seat decisions go through `evaluateParityEnrollment`.
 */
export function isParityAlert(cap: RoleCapacity, maxImbalanceOverride?: number): boolean {
  const maxImbalance = thresholdFor(cap, maxImbalanceOverride);
  if (!Number.isFinite(maxImbalance)) return false;
  return Math.abs(cap.filledLeads - cap.filledFollows) > maxImbalance;
}

export type PackagePeer = {
  id: string;
  courseTitle: string;
};

/** Same course title across weekdays = one payment package (Salsa getPackagePeers). */
export function getPackagePeers<T extends PackagePeer>(classes: T[], cls: T): T[] {
  const key = cls.courseTitle.trim().toLowerCase();
  return classes.filter((c) => c.courseTitle.trim().toLowerCase() === key);
}

export function getPackageAvailability(
  peers: RoleCapacity[],
): { leadsFree: number; followsFree: number } {
  if (peers.length === 0) return { leadsFree: 0, followsFree: 0 };
  const avail = peers.map(getClassAvailability);
  return {
    leadsFree: Math.min(...avail.map((a) => a.leadsFree)),
    followsFree: Math.min(...avail.map((a) => a.followsFree)),
  };
}
