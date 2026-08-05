import type { NextRequest } from "next/server";
import { getPublicRoomAvailability } from "@/lib/public-api/rentals";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/** GET /api/public/rooms/{roomId}/availability?date=YYYY-MM-DD&durationMinutes=60 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:rental-avail"), {
    limit: 120,
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
  const date = request.nextUrl.searchParams.get("date");
  const durationRaw = request.nextUrl.searchParams.get("durationMinutes");
  if (!date) {
    return publicJson(request, { error: "invalid_query", issues: ["date required"] }, { status: 400 });
  }
  const durationMinutes = durationRaw ? Number(durationRaw) : 60;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return publicJson(request, { error: "invalid_query" }, { status: 400 });
  }

  try {
    const result = await getPublicRoomAvailability({ roomId, date, durationMinutes });
    if (!result.ok) {
      return publicJson(request, { error: result.error }, { status: result.status });
    }
    return publicJson(request, {
      ok: true,
      date: result.date,
      sessionDay: result.sessionDay,
      slots: result.slots,
      timeline: result.timeline,
      summary: result.summary,
    });
  } catch (error) {
    console.error("[public:rooms/availability]", error);
    return publicJson(request, { error: "server_error" }, { status: 500 });
  }
}
