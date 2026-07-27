import "server-only";

import { prisma } from "@/lib/prisma";

export type AdminTenantRow = {
  locationId: string;
  locationName: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  city: string | null;
  timezone: string;
  isActive: boolean;
  memberCount: number;
};

/** Global SaaS tenant matrix — ADMIN only. */
export async function getAdminTenantMatrix(): Promise<AdminTenantRow[]> {
  const locations = await prisma.location.findMany({
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
  });

  return locations.map((loc) => ({
    locationId: loc.id,
    locationName: loc.name,
    organizationId: loc.organization.id,
    organizationName: loc.organization.name,
    organizationSlug: loc.organization.slug,
    city: loc.city,
    timezone: loc.timezone,
    isActive: loc.isActive,
    memberCount: loc._count.members,
  }));
}
