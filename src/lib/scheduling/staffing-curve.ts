import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
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
  const [stationRows, profileRows] = await Promise.all([
    prisma.station.findMany({
      where: { locationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
    prisma.staffingProfile.findMany({ where: { locationId } }),
  ]);

  const byStationId = new Map(profileRows.map((row) => [row.stationId, row]));

  const stations: StationRecord[] = stationRows.map((row) => ({
    id: row.id,
    locationId: row.locationId,
    nameFr: row.nameFr,
    nameEn: row.nameEn,
    nameEs: row.nameEs,
    colorHex: row.colorHex,
    slug: row.slug,
    sortOrder: row.sortOrder,
    tipPoints: asPlainNumber(row.tipPoints),
    isActive: row.isActive,
    capacity: row.capacity,
    surfaceSqm: row.surfaceSqm,
  }));

  const profiles: Record<string, StaffingProfileSnapshot> = {};
  for (const station of stations) {
    const row = byStationId.get(station.id);
    const fallback = defaultProfileForStation(station);
    profiles[station.id] = {
      stationId: station.id,
      targetSplh: row ? asPlainNumber(row.targetSplh) : fallback.targetSplh,
      salesSharePercent: row ? asPlainNumber(row.salesSharePercent) : fallback.salesSharePercent,
      minHeadcount: row?.minHeadcount ?? fallback.minHeadcount,
      maxHeadcount: row?.maxHeadcount ?? fallback.maxHeadcount,
    };
  }

  return { stations, profiles };
});
