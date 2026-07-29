import { NextResponse, type NextRequest } from "next/server";
import { getHubAllowedOrigins } from "@/lib/integrations/resolver";

/**
 * Allowed browser origins for `/api/public/*`.
 * Platform env `RITMOKIT_PUBLIC_ORIGINS` ∪ Integration Hub `allowedOrigins` ∪ localhost.
 */
export function getEnvPublicAllowedOrigins(): string[] {
  const raw = process.env.RITMOKIT_PUBLIC_ORIGINS ?? "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const defaults = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
  ];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (appUrl) defaults.push(appUrl);

  return Array.from(new Set([...fromEnv, ...defaults]));
}

/** Sync helper — env only (tests / edge cases). Prefer `resolveCorsOrigin`. */
export function getPublicAllowedOrigins(): string[] {
  return getEnvPublicAllowedOrigins();
}

export async function getPublicAllowedOriginsAsync(): Promise<string[]> {
  const fromHub = await getHubAllowedOrigins().catch((error) => {
    console.error("[cors] hub origins load failed", error);
    return [] as string[];
  });
  return Array.from(new Set([...getEnvPublicAllowedOrigins(), ...fromHub]));
}

export async function resolveCorsOrigin(request: NextRequest): Promise<string | null> {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = await getPublicAllowedOriginsAsync();
  if (allowed.includes("*")) return origin;
  return allowed.includes(origin) ? origin : null;
}

export async function withPublicCors(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const origin = await resolveCorsOrigin(request);
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export async function publicCorsPreflight(request: NextRequest): Promise<NextResponse> {
  const origin = await resolveCorsOrigin(request);
  if (request.headers.get("origin") && !origin) {
    return NextResponse.json({ error: "cors_origin_denied" }, { status: 403 });
  }
  return withPublicCors(request, new NextResponse(null, { status: 204 }));
}

export async function publicJson(
  request: NextRequest,
  body: unknown,
  init?: { status?: number },
): Promise<NextResponse> {
  return withPublicCors(
    request,
    NextResponse.json(body, { status: init?.status ?? 200 }),
  );
}
