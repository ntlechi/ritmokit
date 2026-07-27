import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type OrgBrandSettings = {
  organizationId: string;
  locationId: string;
  name: string;
  slug: string;
  primaryColor: string;
  welcomeCopy: string;
  logoUrl: string;
  modules: {
    id: string;
    title: string;
    unlockDay: number;
    sortOrder: number;
    estimatedMinutes: number | null;
  }[];
};

export async function getOrgBrandSettings(
  userId: string,
  role: string,
): Promise<{ ok: true; data: OrgBrandSettings } | { ok: false; error: string }> {
  if (!canAccessManagerSettings(role as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: {
        select: {
          id: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              primaryColor: true,
              welcomeCopy: true,
              logoUrl: true,
            },
          },
        },
      },
    },
  });

  if (!membership) return { ok: false, error: "not_found" };

  const org = membership.location.organization;
  const modules = await prisma.formationModule.findMany({
    where: {
      kind: "ONBOARDING",
      isActive: true,
      OR: [
        { locationId: membership.locationId },
        { locationId: null, organizationId: org.id },
      ],
    },
    orderBy: [{ unlockDay: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      title: true,
      unlockDay: true,
      sortOrder: true,
      estimatedMinutes: true,
    },
  });

  return {
    ok: true,
    data: {
      organizationId: org.id,
      locationId: membership.locationId,
      name: org.name,
      slug: org.slug,
      primaryColor: org.primaryColor,
      welcomeCopy: org.welcomeCopy ?? "",
      logoUrl: org.logoUrl ?? "",
      modules,
    },
  };
}
