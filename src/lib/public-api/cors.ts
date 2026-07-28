import { NextResponse, type NextRequest } from "next/server";

/**
 * Allowed browser origins for `/api/public/*` (Salsa Attitude + RitmoKit sites).
 * Set `RITMOKIT_PUBLIC_ORIGINS` as a comma-separated list.
 */
export function getPublicAllowedOrigins(): string[] {
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

export function resolveCorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = getPublicAllowedOrigins();
  if (allowed.includes("*")) return origin;
  return allowed.includes(origin) ? origin : null;
}

export function withPublicCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = resolveCorsOrigin(request);
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

export function publicCorsPreflight(request: NextRequest): NextResponse {
  const origin = resolveCorsOrigin(request);
  if (request.headers.get("origin") && !origin) {
    return NextResponse.json({ error: "cors_origin_denied" }, { status: 403 });
  }
  return withPublicCors(request, new NextResponse(null, { status: 204 }));
}

export function publicJson(
  request: NextRequest,
  body: unknown,
  init?: { status?: number },
): NextResponse {
  return withPublicCors(
    request,
    NextResponse.json(body, { status: init?.status ?? 200 }),
  );
}
