/**
 * New-student onboarding rules — pure, shared by server writers, loaders and
 * unit tests. A student's journey at one location:
 *
 *   NEW ──contact──▶ CONTACTED ──first check-in──▶ ATTENDED ──re-enrols──▶ ACTIVE
 *    └──────────────── first check-in ─────────────▲          LOST ──re-enrols──▶ ACTIVE
 */

export type IntakeStatusValue = "NEW" | "CONTACTED" | "ATTENDED" | "ACTIVE" | "LOST";

/** Statuses that still need a staff action; they appear in the inbox and the badge. */
export const OPEN_INTAKE_STATUSES = ["NEW", "CONTACTED"] as const satisfies readonly IntakeStatusValue[];

/** Inbox column order. */
export const INTAKE_BOARD_ORDER = [
  "NEW",
  "CONTACTED",
  "ATTENDED",
  "ACTIVE",
  "LOST",
] as const satisfies readonly IntakeStatusValue[];

/** A student who already danced here before intake tracking existed is not "new". */
export function initialIntakeStatus(priorEnrollmentsAtLocation: number): IntakeStatusValue {
  return priorEnrollmentsAtLocation > 0 ? "ACTIVE" : "NEW";
}

/** Coming back for another class after the first visit makes the student a regular. */
export function statusOnReEnrollment(current: IntakeStatusValue): IntakeStatusValue | null {
  return current === "ATTENDED" || current === "LOST" ? "ACTIVE" : null;
}

export function statusOnAttendance(current: IntakeStatusValue): IntakeStatusValue | null {
  return current === "NEW" || current === "CONTACTED" ? "ATTENDED" : null;
}

const FIRST_VISIT_GRACE_MS = 12 * 60 * 60 * 1000;

/**
 * "1er cours" flag on a roster row: the student has never been checked in
 * here, or was checked in for the first time tonight (so the flag survives
 * the refresh right after tapping Présent).
 */
export function isFirstVisit(
  status: IntakeStatusValue | null | undefined,
  firstAttendedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status === "NEW" || status === "CONTACTED") return true;
  if (status !== "ATTENDED" || !firstAttendedAt) return false;
  const at = typeof firstAttendedAt === "string" ? new Date(firstAttendedAt) : firstAttendedAt;
  return now.getTime() - at.getTime() < FIRST_VISIT_GRACE_MS;
}
