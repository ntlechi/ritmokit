import "server-only";

import { prisma } from "@/lib/prisma";

export type PublicLocation = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
};

/**
 * Resolve a public studio location by UUID or slug.
 * Prefer `locationSlug` (or org slug + location slug) for website URLs.
 */
export async function resolvePublicLocation(input: {
  locationId?: string | null;
  locationSlug?: string | null;
  organizationSlug?: string | null;
}): Promise<PublicLocation | null> {
  if (input.locationId) {
    const row = await prisma.location.findFirst({
      where: { id: input.locationId, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        organizationId: true,
        organization: { select: { slug: true, name: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      timezone: row.timezone,
      organizationId: row.organizationId,
      organizationSlug: row.organization.slug,
      organizationName: row.organization.name,
    };
  }

  const locationSlug = input.locationSlug?.trim().toLowerCase();
  if (!locationSlug) return null;

  // `Location.slug` is unique per organisation only. Without `organizationSlug`
  // an ambiguous slug must fail closed rather than pick a tenant by row order.
  const orgSlug = input.organizationSlug?.trim().toLowerCase();
  const rows = await prisma.location.findMany({
    where: {
      slug: locationSlug,
      isActive: true,
      ...(orgSlug ? { organization: { slug: orgSlug } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      organizationId: true,
      organization: { select: { slug: true, name: true } },
    },
    take: 2,
  });
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    organizationId: row.organizationId,
    organizationSlug: row.organization.slug,
    organizationName: row.organization.name,
  };
}
