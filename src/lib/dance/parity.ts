import type { DanceRole } from "@/generated/prisma/enums";

/** Default max |leads − follows| before the fuller side is blocked. */
export const DEFAULT_MAX_IMBALANCE = 2;

export type RoleCapacity = {
  maxLeads: number;
  maxFollows: number;
  filledLeads: number;
  filledFollows: number;
};

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

export function getClassAvailability(cap: RoleCapacity): ClassAvailability {
  const leadsFree = Math.max(0, cap.maxLeads - cap.filledLeads);
  const followsFree = Math.max(0, cap.maxFollows - cap.filledFollows);
  return {
    leadsFree,
    followsFree,
    leadsFilled: cap.filledLeads,
    followsFilled: cap.filledFollows,
    maxLeads: cap.maxLeads,
    maxFollows: cap.maxFollows,
    full: leadsFree <= 0 && followsFree <= 0,
    imbalance: Math.abs(cap.filledLeads - cap.filledFollows),
  };
}

/**
 * Evaluate whether a dancer can take a seat for `role`.
 * When `allowWaitlist` is true, imbalance/full roles become waitlisted instead of hard-blocked.
 */
export function evaluateParityEnrollment(
  cap: RoleCapacity,
  role: DanceRole,
  options?: { maxImbalance?: number; allowWaitlist?: boolean },
): ParityDecision {
  const maxImbalance = options?.maxImbalance ?? DEFAULT_MAX_IMBALANCE;
  const allowWaitlist = options?.allowWaitlist ?? true;

  if (role === "SOLO") {
    const free = Math.max(0, cap.maxLeads + cap.maxFollows - cap.filledLeads - cap.filledFollows);
    if (free <= 0) {
      return allowWaitlist
        ? { ok: true, waitlisted: true, reason: "role_full" }
        : { ok: false, reason: "role_full", waitlisted: false };
    }
    return { ok: true, waitlisted: false };
  }

  const avail = getClassAvailability(cap);
  const free = role === "LEAD" ? avail.leadsFree : avail.followsFree;
  if (free <= 0) {
    return allowWaitlist
      ? { ok: true, waitlisted: true, reason: "role_full" }
      : { ok: false, reason: "role_full", waitlisted: false };
  }

  const nextLeads = cap.filledLeads + (role === "LEAD" ? 1 : 0);
  const nextFollows = cap.filledFollows + (role === "FOLLOW" ? 1 : 0);
  const nextImbalance = Math.abs(nextLeads - nextFollows);

  if (nextImbalance > maxImbalance) {
    return allowWaitlist
      ? { ok: true, waitlisted: true, reason: "imbalance" }
      : { ok: false, reason: "imbalance", waitlisted: false };
  }

  return { ok: true, waitlisted: false };
}

/**
 * A couple (one Lead + one Follow) never worsens imbalance.
 * Confirm when both roles still have a seat.
 */
export function evaluateCoupleEnrollment(cap: RoleCapacity): ParityDecision {
  const avail = getClassAvailability(cap);
  if (avail.leadsFree < 1 || avail.followsFree < 1) {
    return { ok: false, reason: "role_full", waitlisted: false };
  }
  return { ok: true, waitlisted: false };
}

/** True when filled counts already exceed tolerance (for agent alerts). */
export function isParityAlert(
  cap: RoleCapacity,
  maxImbalance = DEFAULT_MAX_IMBALANCE,
): boolean {
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
