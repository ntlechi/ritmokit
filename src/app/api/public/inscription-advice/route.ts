import type { NextRequest } from "next/server";
import { z } from "zod";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { getInscriptionAdvice } from "@/lib/public-api/inscription-advice";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";

export const runtime = "nodejs";

const querySchema = z.object({
  locationId: z.string().uuid().optional(),
  locationSlug: z.string().min(1).max(80).optional(),
  organizationSlug: z.string().min(1).max(80).optional(),
  role: z.enum(["LEAD", "FOLLOW"]),
  style: z.string().min(1).max(80).optional(),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  withPartner: z
    .enum(["1", "true", "yes", "0", "false", "no"])
    .optional()
    .transform((value) => value === "1" || value === "true" || value === "yes"),
});

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/**
 * GET /api/public/inscription-advice
 * Dance-native concierge: live Lead/Follow seats, waitlist, or couple unlock.
 */
export async function GET(request: NextRequest) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:inscription-advice"), {
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

  const parsed = querySchema.safeParse({
    locationId: request.nextUrl.searchParams.get("locationId") ?? undefined,
    locationSlug: request.nextUrl.searchParams.get("locationSlug") ?? undefined,
    organizationSlug: request.nextUrl.searchParams.get("organizationSlug") ?? undefined,
    role: request.nextUrl.searchParams.get("role") ?? undefined,
    style: request.nextUrl.searchParams.get("style") ?? undefined,
    level: request.nextUrl.searchParams.get("level") ?? undefined,
    dayOfWeek: request.nextUrl.searchParams.get("dayOfWeek") ?? undefined,
    withPartner: request.nextUrl.searchParams.get("withPartner") ?? undefined,
  });
  if (!parsed.success) {
    return publicJson(request, { error: "invalid_query" }, { status: 400 });
  }

  try {
    const result = await getInscriptionAdvice(parsed.data);
    if (!result.ok) {
      return publicJson(request, { error: result.error }, { status: result.status });
    }
    return publicJson(request, {
      ok: true,
      locationId: result.locationId,
      locationName: result.locationName,
      query: {
        role: parsed.data.role,
        style: parsed.data.style ?? null,
        level: parsed.data.level ?? null,
        dayOfWeek: parsed.data.dayOfWeek ?? null,
        withPartner: Boolean(parsed.data.withPartner),
      },
      ...result.advice,
    });
  } catch (error) {
    console.error("[public:inscription-advice]", error);
    return publicJson(request, { error: "server_error" }, { status: 500 });
  }
}
