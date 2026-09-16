/**
 * Deterministic pseudonym for a retired student. Pure — safe to unit test and
 * to re-run: anonymizing twice yields the same row, so the sweep is idempotent.
 */
import { createHash } from "node:crypto";

export const ANONYMIZED_EMAIL_DOMAIN = "anon.ritmokit.invalid";
export const ANONYMIZED_FULL_NAME = "Élève retiré·e";

export function anonymizedIdentity(studentId: string): { email: string; fullName: string } {
  const digest = createHash("sha256").update(studentId).digest("hex").slice(0, 16);
  return {
    email: `retire.${digest}@${ANONYMIZED_EMAIL_DOMAIN}`,
    fullName: ANONYMIZED_FULL_NAME,
  };
}

export function isAnonymizedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`);
}

/** Door walk-ins without an email get a synthetic address; they are PII-free already. */
export function isSyntheticDoorEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@door.ritmokit.invalid");
}
