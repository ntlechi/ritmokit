import type { NextRequest } from "next/server";
import { createPublicRentalBooking, publicRentalBookingSchema } from "@/lib/public-api/rentals";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/** POST /api/public/rental-bookings */
export async function POST(request: NextRequest) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:rental-book"), {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return publicJson(
      request,
      { error: "rate_limited", retryAfterSec: limit.retryAfterSec },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return publicJson(request, { error: "invalid_json" }, { status: 400 });
  }

  const parsed = publicRentalBookingSchema.safeParse(body);
  if (!parsed.success) {
    return publicJson(
      request,
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await createPublicRentalBooking(parsed.data);
    if (!result.ok) {
      return publicJson(request, { ok: false, error: result.error }, { status: result.status });
    }
    return publicJson(
      request,
      {
        ok: true,
        bookingId: result.bookingId,
        status: result.status,
        paymentStatus: result.paymentStatus,
        priceCents: result.priceCents,
        interacInstructions: result.interacInstructions,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[public:rental-bookings]", error);
    return publicJson(request, { error: "server_error" }, { status: 500 });
  }
}
