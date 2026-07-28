import type { NextRequest } from "next/server";
import { z } from "zod";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";
import { getPublicSchedule } from "@/lib/public-api/schedule";
import { resolvePublicLocation } from "@/lib/public-api/tenant";

export const runtime = "nodejs";

const querySchema = z.object({
  locationId: z.string().uuid().optional(),
  locationSlug: z.string().min(1).max(80).optional(),
  organizationSlug: z.string().min(1).max(80).optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  style: z.string().min(1).max(80).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
});

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/**
 * GET /api/public/schedule
 * Public class schedule for an active booking season.
 *
 * Query: locationId | locationSlug [& organizationSlug]
 * Optional filters: level, style, dayOfWeek (0=Sun … 6=Sat)
 */
export async function GET(request: NextRequest) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:schedule"), {
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

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    locationId: url.searchParams.get("locationId") ?? undefined,
    locationSlug: url.searchParams.get("locationSlug") ?? undefined,
    organizationSlug: url.searchParams.get("organizationSlug") ?? undefined,
    level: url.searchParams.get("level") ?? undefined,
    style: url.searchParams.get("style") ?? undefined,
    dayOfWeek: url.searchParams.get("dayOfWeek") ?? undefined,
  });

  if (!parsed.success) {
    return publicJson(
      request,
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!parsed.data.locationId && !parsed.data.locationSlug) {
    return publicJson(
      request,
      { error: "location_required", hint: "Pass locationId or locationSlug" },
      { status: 400 },
    );
  }

  const location = await resolvePublicLocation(parsed.data);
  if (!location) {
    return publicJson(request, { error: "location_not_found" }, { status: 404 });
  }

  const schedule = await getPublicSchedule({
    locationId: location.id,
    level: parsed.data.level,
    style: parsed.data.style,
    dayOfWeek: parsed.data.dayOfWeek,
  });

  return publicJson(request, {
    ok: true,
    studio: {
      locationId: location.id,
      locationSlug: location.slug,
      locationName: location.name,
      organizationSlug: location.organizationSlug,
      organizationName: location.organizationName,
      timezone: location.timezone,
    },
    season: schedule.season,
    classes: schedule.classes,
  });
}
