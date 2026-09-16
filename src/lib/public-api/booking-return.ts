/**
 * Resolve the studio's own public website base (PayPal return / calendar link).
 * Tenant Integration Hub origins win. Platform env is a last-resort fallback
 * so one pilot site never hijacks every other studio.
 */
import "server-only";

import { getEnvPublicAllowedOrigins } from "@/lib/public-api/cors";
import { isAllowedReturnUrl, originOf } from "@/lib/public-api/return-url";
import { prisma } from "@/lib/prisma";

export { isAllowedReturnUrl } from "@/lib/public-api/return-url";

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Origins a tenant may send dancers back to after PayPal/Stripe:
 * its Integration Hub `allowedOrigins` ∪ platform env. Pure string set —
 * compared by exact origin, never by prefix, so `https://salsa.qc.evil.tld`
 * does not match `https://salsa.qc`.
 */
export async function allowedReturnOrigins(locationId?: string | null): Promise<Set<string>> {
  const out = new Set<string>();
  for (const o of getEnvPublicAllowedOrigins()) {
    const origin = originOf(o);
    if (origin) out.add(origin);
  }
  const base = process.env.RITMOKIT_PUBLIC_BOOKING_RETURN_BASE?.trim();
  const baseOrigin = base ? originOf(base) : null;
  if (baseOrigin) out.add(baseOrigin);

  if (locationId) {
    const loc = await prisma.location.findUnique({
      where: { id: locationId },
      select: {
        organization: {
          select: {
            integrations: {
              where: { status: { in: ["CONNECTED", "TESTING"] } },
              select: { allowedOrigins: true },
              take: 10,
            },
          },
        },
      },
    });
    for (const integ of loc?.organization.integrations ?? []) {
      for (const o of integ.allowedOrigins) {
        const origin = originOf(o);
        if (origin) out.add(origin);
      }
    }
  }
  return out;
}

/**
 * 1. This organization's Integration Hub `allowedOrigins`
 * 2. Platform `RITMOKIT_PUBLIC_BOOKING_RETURN_BASE` (single-tenant / local only)
 */
export async function resolvePublicBookingBaseUrl(locationId?: string | null): Promise<string | null> {
  if (!locationId) {
    const fromEnv = process.env.RITMOKIT_PUBLIC_BOOKING_RETURN_BASE?.trim();
    return fromEnv ? trimBase(fromEnv) : null;
  }

  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      organizationId: true,
      organization: {
        select: {
          integrations: {
            where: { status: { in: ["CONNECTED", "TESTING"] } },
            select: { allowedOrigins: true },
            take: 5,
          },
        },
      },
    },
  });

  for (const integ of loc?.organization.integrations ?? []) {
    const origin = integ.allowedOrigins.find(
      (o) => o && !o.includes("localhost") && !o.includes("127.0.0.1"),
    );
    if (origin) return trimBase(origin);
  }
  for (const integ of loc?.organization.integrations ?? []) {
    const origin = integ.allowedOrigins[0];
    if (origin) return trimBase(origin);
  }

  const fromEnv = process.env.RITMOKIT_PUBLIC_BOOKING_RETURN_BASE?.trim();
  return fromEnv ? trimBase(fromEnv) : null;
}

export async function resolvePublicBookingReturnUrls(input: {
  enrollmentId: string;
  locationId?: string | null;
  returnUrl?: string | null;
  cancelUrl?: string | null;
}): Promise<{ returnUrl: string; cancelUrl: string; rejectedClientUrls: boolean }> {
  // Client-supplied targets are honoured only when their origin is on the
  // tenant's whitelist — otherwise a hostile widget could bounce a dancer
  // (with `enrollmentId` in the query) to any site after paying.
  const allowed = await allowedReturnOrigins(input.locationId);
  const clientReturn = isAllowedReturnUrl(input.returnUrl, allowed) ? input.returnUrl.trim() : null;
  const clientCancel = isAllowedReturnUrl(input.cancelUrl, allowed) ? input.cancelUrl.trim() : null;
  const rejectedClientUrls =
    (Boolean(input.returnUrl?.trim()) && !clientReturn) ||
    (Boolean(input.cancelUrl?.trim()) && !clientCancel);
  if (rejectedClientUrls) {
    console.warn("[booking-return] rejected off-whitelist return url", {
      locationId: input.locationId ?? null,
      returnOrigin: input.returnUrl ? originOf(input.returnUrl) : null,
      cancelOrigin: input.cancelUrl ? originOf(input.cancelUrl) : null,
    });
  }

  if (clientReturn && clientCancel) {
    return { returnUrl: clientReturn, cancelUrl: clientCancel, rejectedClientUrls };
  }

  const base = await resolvePublicBookingBaseUrl(input.locationId);
  if (base) {
    return {
      returnUrl:
        clientReturn ||
        `${base}/?booking=confirmation&enrollmentId=${encodeURIComponent(input.enrollmentId)}`,
      cancelUrl:
        clientCancel ||
        `${base}/?booking=cancelled&enrollmentId=${encodeURIComponent(input.enrollmentId)}`,
      rejectedClientUrls,
    };
  }

  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return {
    returnUrl:
      clientReturn || `${app}/api/public/enrollments/${input.enrollmentId}/payment-status?paid=1`,
    cancelUrl:
      clientCancel ||
      `${app}/api/public/enrollments/${input.enrollmentId}/payment-status?cancelled=1`,
    rejectedClientUrls,
  };
}
