/**
 * Resolve the studio's own public website base (PayPal return / calendar link).
 * Tenant Integration Hub origins win. Platform env is a last-resort fallback
 * so one pilot site never hijacks every other studio.
 */
import "server-only";

import { prisma } from "@/lib/prisma";

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
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
}): Promise<{ returnUrl: string; cancelUrl: string }> {
  if (input.returnUrl?.trim() && input.cancelUrl?.trim()) {
    return {
      returnUrl: input.returnUrl.trim(),
      cancelUrl: input.cancelUrl.trim(),
    };
  }

  const base = await resolvePublicBookingBaseUrl(input.locationId);
  if (base) {
    return {
      returnUrl:
        input.returnUrl?.trim() ||
        `${base}/?booking=confirmation&enrollmentId=${encodeURIComponent(input.enrollmentId)}`,
      cancelUrl:
        input.cancelUrl?.trim() ||
        `${base}/?booking=cancelled&enrollmentId=${encodeURIComponent(input.enrollmentId)}`,
    };
  }

  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return {
    returnUrl:
      input.returnUrl?.trim() ||
      `${app}/api/public/enrollments/${input.enrollmentId}/payment-status?paid=1`,
    cancelUrl:
      input.cancelUrl?.trim() ||
      `${app}/api/public/enrollments/${input.enrollmentId}/payment-status?cancelled=1`,
  };
}
