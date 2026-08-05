import type { NextRequest } from "next/server";
import { getPublicRoomMonthSummary } from "@/lib/public-api/rentals";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/** GET /api/public/rooms/{roomId}/month-summary?year=2026&month=9&durationMinutes=60 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:rental-month"), {
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

  const { roomId } = await context.params;
  const year = Number(request.nextUrl.searchParams.get("year"));
  const month = Number(request.nextUrl.searchParams.get("month"));
  const durationRaw = request.nextUrl.searchParams.get("durationMinutes");
  const durationMinutes = durationRaw ? Number(durationRaw) : 60;

  try {
    const result = await getPublicRoomMonthSummary({
      roomId,
      year,
      month,
      durationMinutes,
    });
    if (!result.ok) {
      return publicJson(request, { error: result.error }, { status: result.status });
    }
    return publicJson(request, { ok: true, ...result.summary });
  } catch (error) {
    console.error("[public:rooms/month-summary]", error);
    return publicJson(request, { error: "server_error" }, { status: 500 });
  }
}
