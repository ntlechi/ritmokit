/**
 * Authorize /api/studio/* for dashboard session OR machine roster token.
 *
 * Roster tokens are tenant-bound. From the platform secret
 * `RITMOKIT_STUDIO_ROSTER_SECRET` we derive one token per organisation:
 *
 *     rk1.<organizationSlug>.<hex(HMAC-SHA256(secret, organizationSlug))[0:32]>
 *
 * A proxy holding Salsa Attitude's token can only resolve Salsa Attitude's
 * locations — it can never name Studio B's `locationId`. The platform secret
 * itself is never handed to a tenant. Print a token with
 * `npm run roster-token -- <organizationSlug>`.
 *
 * Bare-secret bearers (legacy) are accepted only when `RITMOKIT_STUDIO_ROSTER_ORG`
 * pins them to one organisation slug, or outside production.
 */
import "server-only";

import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canAccessAccueil } from "@/lib/auth/session-client";
import {
  deriveRosterToken as deriveWithSecret,
  MIN_ROSTER_SECRET_LENGTH,
  ORGANIZATION_SLUG_RE,
  ROSTER_TOKEN_PREFIX,
  safeEqualString,
  verifyRosterToken,
} from "@/lib/studio-api/roster-token";
import type { Role } from "@/generated/prisma/enums";

function platformSecret(): string | null {
  const secret = process.env.RITMOKIT_STUDIO_ROSTER_SECRET?.trim();
  return secret && secret.length >= MIN_ROSTER_SECRET_LENGTH ? secret : null;
}

export type StudioAuth =
  | { mode: "session"; userId: string; role: Role }
  | {
      mode: "roster_secret";
      /** Organisation this token may read. `null` only outside production. */
      organizationSlug: string | null;
    };

export function studioRosterSecretConfigured(): boolean {
  return platformSecret() !== null;
}

/** Deterministic per-tenant token from the configured platform secret. */
export function deriveRosterToken(organizationSlug: string): string | null {
  const secret = platformSecret();
  return secret ? deriveWithSecret(organizationSlug, secret) : null;
}

type BearerVerdict =
  | { ok: true; organizationSlug: string | null }
  | { ok: false };

function verifyBearer(token: string): BearerVerdict {
  const secret = platformSecret();
  if (!secret) return { ok: false };

  if (token.startsWith(`${ROSTER_TOKEN_PREFIX}.`)) return verifyRosterToken(token, secret);

  // Legacy platform-wide secret.
  if (!safeEqualString(token, secret)) return { ok: false };
  const pinned = process.env.RITMOKIT_STUDIO_ROSTER_ORG?.trim().toLowerCase();
  if (pinned && ORGANIZATION_SLUG_RE.test(pinned)) return { ok: true, organizationSlug: pinned };
  if (process.env.NODE_ENV !== "production") return { ok: true, organizationSlug: null };
  console.warn("[studio-api] unscoped roster secret rejected in production; use a rk1 token");
  return { ok: false };
}

export function verifyStudioRosterBearer(request: NextRequest): BearerVerdict {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return { ok: false };
  const token = header.slice(7).trim();
  if (!token) return { ok: false };
  return verifyBearer(token);
}

/**
 * Prefer roster Bearer (tenant proxy), else Accueil/manager session cookie.
 */
export async function authorizeStudioRoster(
  request: NextRequest,
): Promise<StudioAuth | { error: string; status: number }> {
  const bearer = verifyStudioRosterBearer(request);
  if (bearer.ok) {
    return { mode: "roster_secret", organizationSlug: bearer.organizationSlug };
  }
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    return { error: "invalid_roster_token", status: 401 };
  }

  const user = await getSessionUser();
  if (!user) return { error: "unauthorized", status: 401 };
  if (!canAccessAccueil(user.role)) return { error: "forbidden", status: 403 };
  return { mode: "session", userId: user.id, role: user.role };
}
