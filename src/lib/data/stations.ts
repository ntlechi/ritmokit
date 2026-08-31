import "server-only";

import { getPrimaryMembership } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { StationKindValue } from "@/lib/stations/dance-defaults";
import type { StationRecord } from "@/lib/stations/display";

function mapStation(row: {
  id: string;
  locationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  slug: string | null;
  sortOrder: number;
  kind: StationKindValue;
  isActive: boolean;
  capacity: number | null;
  surfaceSqm: number | null;
}): StationRecord {
  return {
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
  };
}

export async function getStationsForLocation(
  locationId: string,
  { activeOnly = true, kind }: { activeOnly?: boolean; kind?: StationKindValue } = {},
): Promise<StationRecord[]> {
  const rows = await prisma.station.findMany({
    where: {
      locationId,
      ...(activeOnly ? { isActive: true } : {}),
      ...(kind ? { kind } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
  });
  return rows.map(mapStation);
}

export async function getStationById(stationId: string): Promise<StationRecord | null> {
  const row = await prisma.station.findUnique({ where: { id: stationId } });
  return row ? mapStation(row) : null;
}

export async function getPrimaryLocationIdForUser(userId: string): Promise<string | null> {
  const membership = await getPrimaryMembership(userId);
  return membership?.locationId ?? null;
}

export async function getStationsForUser(
  userId: string,
  options?: { activeOnly?: boolean; kind?: StationKindValue },
): Promise<{ locationId: string; stations: StationRecord[] } | null> {
  const locationId = await getPrimaryLocationIdForUser(userId);
  if (!locationId) return null;
  const stations = await getStationsForLocation(locationId, options);
  return { locationId, stations };
}

export function stationsById(stations: StationRecord[]): Map<string, StationRecord> {
  return new Map(stations.map((s) => [s.id, s]));
}
