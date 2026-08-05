import type { NextRequest } from "next/server";
import { getPublicRentalBooking } from "@/lib/public-api/rentals";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/** GET /api/public/rental-bookings/{id} */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:rental-get"), {
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

  const { id } = await context.params;
  try {
    const result = await getPublicRentalBooking(id);
    if (!result.ok) {
      return publicJson(request, { error: result.error }, { status: result.status });
    }
    return publicJson(request, { ok: true, booking: result.booking });
  } catch (error) {
    console.error("[public:rental-bookings/id]", error);
    return publicJson(request, { error: "server_error" }, { status: 500 });
  }
}
