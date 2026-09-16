/**
 * Tenant scoping for staff mutations on classes / enrollments.
 *
 * A class belongs to the location of its season, or of its room when it is an
 * orphan (no season). Staff may only touch classes at locations they can
 * operate (`getAccessibleLocations`: floor staff = their memberships,
 * OWNER/ADMIN = every location of their brand — never another tenant).
 */
import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { getAccessibleLocations } from "@/lib/locations/active-location";

export type StaffScope = { userId: string; locationIds: string[] };

export async function staffScope(user: { id: string; role: Role }): Promise<StaffScope> {
  const locations = await getAccessibleLocations(user.id, user.role);
  return { userId: user.id, locationIds: locations.map((l) => l.id) };
}

export function sessionScopeWhere(locationIds: readonly string[]): Prisma.ClassSessionWhereInput {
  const ids = [...locationIds];
  return {
    OR: [
      { season: { locationId: { in: ids } } },
      { seasonId: null, room: { locationId: { in: ids } } },
    ],
  };
}

export function enrollmentScopeWhere(locationIds: readonly string[]): Prisma.EnrollmentWhereInput {
  return { session: sessionScopeWhere(locationIds) };
}
