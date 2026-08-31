import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export const ACTIVE_LOCATION_COOKIE = "ritmokit-location-id";

export type AccessibleLocation = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  timezone: string;
  organizationId: string;
  organizationName: string;
};

const locationSelect = {
  id: true,
  name: true,
  slug: true,
  city: true,
  timezone: true,
  organizationId: true,
  organization: { select: { name: true } },
} as const;

function toAccessible(row: {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  timezone: string;
  organizationId: string;
  organization: { name: string };
}): AccessibleLocation {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city,
    timezone: row.timezone,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
  };
}

export async function readActiveLocationCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(ACTIVE_LOCATION_COOKIE)?.value?.trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Schools this user may operate. Floor staff only see sites they sit on.
 * OWNER/ADMIN see every active location in their brand — never another tenant.
 */
export const getAccessibleLocations = cache(
  async (userId: string, role: Role): Promise<AccessibleLocation[]> => {
    const memberships = await prisma.locationMember.findMany({
      where: { userId, location: { isActive: true } },
      select: { location: { select: locationSelect } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    if (role !== "OWNER" && role !== "ADMIN") {
      return memberships.map((row) => toAccessible(row.location));
    }

    const orgIds = [...new Set(memberships.map((row) => row.location.organizationId))];
    if (orgIds.length === 0) return [];

    const locations = await prisma.location.findMany({
      where: { organizationId: { in: orgIds }, isActive: true },
      select: locationSelect,
      orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    });
    return locations.map(toAccessible);
  },
);

export const resolveActiveLocation = cache(
  async (userId: string, role: Role): Promise<AccessibleLocation | null> => {
    const accessible = await getAccessibleLocations(userId, role);
    if (accessible.length === 0) return null;

    const cookieId = await readActiveLocationCookie();
    if (cookieId && /^[0-9a-f-]{36}$/i.test(cookieId)) {
      const fromCookie = accessible.find((row) => row.id === cookieId);
      if (fromCookie) return fromCookie;
    }

    const primary = await prisma.locationMember.findFirst({
      where: { userId, location: { isActive: true } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { locationId: true },
    });
    if (primary) {
      const fromPrimary = accessible.find((row) => row.id === primary.locationId);
      if (fromPrimary) return fromPrimary;
    }

    return accessible[0] ?? null;
  },
);

export async function canAccessLocation(
  userId: string,
  role: Role,
  locationId: string,
): Promise<boolean> {
  const accessible = await getAccessibleLocations(userId, role);
  return accessible.some((row) => row.id === locationId);
}
