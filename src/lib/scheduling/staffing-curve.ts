import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  defaultProfileForStation,
  computeRequiredHeadcountCurve,
  type StaffingProfileSnapshot,
} from "@/lib/scheduling/staffing-curve-core";
import type { StationRecord } from "@/lib/stations/display";

export {
  defaultProfileForStation,
  computeRequiredHeadcountCurve,
  type StaffingProfileSnapshot,
} from "@/lib/scheduling/staffing-curve-core";

export const getStaffingProfilesForLocation = cache(async function getStaffingProfilesForLocation(
  locationId: string,
): Promise<{ stations: StationRecord[]; profiles: Record<string, StaffingProfileSnapshot> }> {
  const stationRows = await prisma.station.findMany({
    where: { locationId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
  });

  const stations: StationRecord[] = stationRows.map((row) => ({
    id: row.id,
    locationId: row.locationId,
    nameFr: row.nameFr,
    nameEn: row.nameEn,
    nameEs: row.nameEs,
    colorHex: row.colorHex,
    slug: row.slug,
    sortOrder: row.sortOrder,
    kind: row.kind,
    isActive: row.isActive,
    capacity: row.capacity,
    surfaceSqm: row.surfaceSqm,
  }));

  const profiles: Record<string, StaffingProfileSnapshot> = {};
  for (const station of stations) {
    profiles[station.id] = defaultProfileForStation(station);
  }

  return { stations, profiles };
});
