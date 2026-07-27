import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getStaffingProfilesForLocation, type StaffingProfileSnapshot } from "@/lib/scheduling/staffing-curve";
import type { StationRecord } from "@/lib/stations/display";

export type StaffingProfileResult =
  | {
      ok: true;
      locationId: string;
      locationName: string;
      stations: StationRecord[];
      profiles: Record<string, StaffingProfileSnapshot>;
    }
  | { ok: false; error: "unauthorized" };

export async function getStaffingProfilesForUser(
  userId: string,
  userRole: string,
): Promise<StaffingProfileResult> {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: { select: { name: true } } },
  });

  if (!membership) return { ok: false, error: "unauthorized" };

  const { stations, profiles } = await getStaffingProfilesForLocation(membership.locationId);
  return {
    ok: true,
    locationId: membership.locationId,
    locationName: membership.location.name,
    stations,
    profiles,
  };
}
