/**
 * Resolve public BookingModal return/cancel URLs for PayPal redirects.
 * Prefer tenant site (Salsa) over RitmoKit login.
 */
import "server-only";

import { prisma } from "@/lib/prisma";

function trimBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Env `RITMOKIT_PUBLIC_BOOKING_RETURN_BASE` (e.g. https://salsa-attitude.vercel.app)
 * or first Integration Hub `allowedOrigins` entry for the location's org.
 */
export async function resolvePublicBookingBaseUrl(locationId?: string | null): Promise<string | null> {
  const fromEnv = process.env.RITMOKIT_PUBLIC_BOOKING_RETURN_BASE?.trim();
  if (fromEnv) return trimBase(fromEnv);

  if (!locationId) return null;

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

  return null;
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
