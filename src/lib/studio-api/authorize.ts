/**
 * Authorize /api/studio/* for dashboard session OR machine roster secret.
 * Bearer secret stays server-side (Salsa Vercel proxy) — never in VITE_*.
 */
import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { canAccessAccueil } from "@/lib/auth/session-client";
import type { Role } from "@/generated/prisma/enums";

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type StudioAuth =
  | { mode: "session"; userId: string; role: Role }
  | { mode: "roster_secret" };

export function studioRosterSecretConfigured(): boolean {
  const secret = process.env.RITMOKIT_STUDIO_ROSTER_SECRET?.trim();
  return Boolean(secret && secret.length >= 16);
}

export function verifyStudioRosterBearer(request: NextRequest): boolean {
  const secret = process.env.RITMOKIT_STUDIO_ROSTER_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;
  return safeEqualString(token, secret);
}

/**
 * Prefer roster Bearer (tenant proxy), else Accueil/manager session cookie.
 */
export async function authorizeStudioRoster(
  request: NextRequest,
): Promise<StudioAuth | { error: string; status: number }> {
  if (verifyStudioRosterBearer(request)) {
    return { mode: "roster_secret" };
  }

  const user = await getSessionUser();
  if (!user) return { error: "unauthorized", status: 401 };
  if (!canAccessAccueil(user.role)) return { error: "forbidden", status: 403 };
  return { mode: "session", userId: user.id, role: user.role };
}
