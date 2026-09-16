import "server-only";

import { getPayPalCredentialsForOrg, getStripeCredentialsForOrg } from "@/lib/integrations/resolver";
import { allowPayPalStub, isPayPalConfigured } from "@/lib/payments/paypal";
import { allowStripeStub, isStripeConfigured } from "@/lib/payments/stripe";
import { prisma } from "@/lib/prisma";
import type { PaymentProvider } from "@/lib/public-api/payments";

export type PublicBookableStudio = {
  locationId: string;
  locationName: string;
  locationSlug: string;
  organizationName: string;
  organizationSlug: string;
  timezone: string;
  seasonName: string;
};

export function publicBookingPath(
  lang: string,
  organizationSlug: string,
  locationSlug: string,
): string {
  return `/${lang}/book/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(locationSlug)}`;
}

export function publicBookingUrl(
  lang: string,
  organizationSlug: string,
  locationSlug: string,
): string {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return `${app}${publicBookingPath(lang, organizationSlug, locationSlug)}`;
}

/** Studios with an ACTIVE season that is taking online registrations. */
export async function listPublicBookableStudios(): Promise<PublicBookableStudio[]> {
  const seasons = await prisma.sessionSeason.findMany({
    where: {
      status: "ACTIVE",
      bookingOpen: true,
      location: { isActive: true },
    },
    orderBy: { startsOn: "desc" },
    select: {
      name: true,
      location: {
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          organization: { select: { name: true, slug: true } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const studios: PublicBookableStudio[] = [];
  for (const season of seasons) {
    if (seen.has(season.location.id)) continue;
    seen.add(season.location.id);
    studios.push({
      locationId: season.location.id,
      locationName: season.location.name,
      locationSlug: season.location.slug,
      organizationName: season.location.organization.name,
      organizationSlug: season.location.organization.slug,
      timezone: season.location.timezone,
      seasonName: season.name,
    });
  }
  return studios;
}

export async function listPublicPaymentMethods(
  organizationId: string,
): Promise<Array<Extract<PaymentProvider, "interac" | "stripe" | "paypal">>> {
  const methods: Array<Extract<PaymentProvider, "interac" | "stripe" | "paypal">> = ["interac"];
  const [paypal, stripe] = await Promise.all([
    getPayPalCredentialsForOrg(organizationId),
    getStripeCredentialsForOrg(organizationId),
  ]);
  if (isPayPalConfigured(paypal) || allowPayPalStub()) methods.push("paypal");
  if (isStripeConfigured(stripe) || allowStripeStub()) methods.push("stripe");
  return methods;
}
