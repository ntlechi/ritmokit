import type { NextRequest } from "next/server";
import { getPublicSessions } from "@/lib/public-api/content";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/** GET /api/public/sessions?locationId=|&locationSlug=&organizationSlug= */
export async function GET(request: NextRequest) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:sessions"), {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return publicJson(
      request,
      { error: "rate_limited", retryAfterSec: limit.retryAfterSec },
      { status: 429 },
    );
  }

  const sp = request.nextUrl.searchParams;
  try {
    const result = await getPublicSessions({
      locationId: sp.get("locationId"),
      locationSlug: sp.get("locationSlug"),
      organizationSlug: sp.get("organizationSlug"),
    });
    if (!result.ok) {
      return publicJson(request, { error: result.error }, { status: result.status });
    }
    return publicJson(request, {
      ok: true,
      locationId: result.locationId,
      sessions: result.sessions,
    });
  } catch (error) {
    console.error("[public:sessions]", error);
    return publicJson(request, { error: "server_error" }, { status: 500 });
  }
}
