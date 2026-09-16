/**
 * Tenant-bound roster token — pure (no env, no server-only) so it can be
 * unit-tested and reused by the CLI printer.
 *
 *     rk1.<organizationSlug>.<hex(HMAC-SHA256(secret, organizationSlug))[0:32]>
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ROSTER_TOKEN_PREFIX = "rk1";
const MAC_HEX_LENGTH = 32;
export const ORGANIZATION_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const MIN_ROSTER_SECRET_LENGTH = 16;

export function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Deterministic per-tenant token. `null` when the slug is malformed or the secret too short. */
export function deriveRosterToken(organizationSlug: string, secret: string): string | null {
  const slug = organizationSlug.trim().toLowerCase();
  if (secret.length < MIN_ROSTER_SECRET_LENGTH || !ORGANIZATION_SLUG_RE.test(slug)) return null;
  const mac = createHmac("sha256", secret).update(slug).digest("hex").slice(0, MAC_HEX_LENGTH);
  return `${ROSTER_TOKEN_PREFIX}.${slug}.${mac}`;
}

export type RosterTokenVerdict = { ok: true; organizationSlug: string } | { ok: false };

/** Constant-time check of an `rk1.` token against the platform secret. */
export function verifyRosterToken(token: string, secret: string): RosterTokenVerdict {
  if (!token.startsWith(`${ROSTER_TOKEN_PREFIX}.`)) return { ok: false };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const slug = parts[1];
  const expected = deriveRosterToken(slug, secret);
  if (!expected) return { ok: false };
  return safeEqualString(token, expected) ? { ok: true, organizationSlug: slug } : { ok: false };
}
