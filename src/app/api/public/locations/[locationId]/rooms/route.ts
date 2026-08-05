import type { NextRequest } from "next/server";
import { getPublicRentalRooms } from "@/lib/public-api/rentals";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/**
 * GET /api/public/locations/{locationId}/rooms
 * Also accepts ?locationSlug=&organizationSlug= (locationId path may be "by-slug").
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ locationId: string }> },
) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:rental-rooms"), {
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

  const { locationId: pathId } = await context.params;
  const sp = request.nextUrl.searchParams;
  const locationSlug = sp.get("locationSlug");
  const organizationSlug = sp.get("organizationSlug");

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      pathId,
    );

  try {
    const result = await getPublicRentalRooms({
      locationId: isUuid ? pathId : null,
      locationSlug: !isUuid && pathId !== "by-slug" ? pathId : locationSlug,
      organizationSlug,
    });
    if (!result.ok) {
      return publicJson(request, { error: result.error }, { status: result.status });
    }
    return publicJson(request, {
      ok: true,
      locationId: result.locationId,
      settings: result.settings,
      floors: result.floors,
    });
  } catch (error) {
    console.error("[public:locations/rooms]", error);
    return publicJson(request, { error: "server_error" }, { status: 500 });
  }
}
