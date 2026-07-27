import "server-only";

import { prisma } from "@/lib/prisma";
import type { StationRecord } from "@/lib/stations/display";
import { asPlainNumber } from "@/lib/data/serialize";

function mapStation(row: {
  id: string;
  locationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  slug: string | null;
  sortOrder: number;
  tipPoints: { toString(): string };
  isActive: boolean;
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
    tipPoints: asPlainNumber(row.tipPoints),
    isActive: row.isActive,
  };
}

export async function getStationsForLocation(
  locationId: string,
  { activeOnly = true }: { activeOnly?: boolean } = {},
): Promise<StationRecord[]> {
  const rows = await prisma.station.findMany({
    where: {
      locationId,
      ...(activeOnly ? { isActive: true } : {}),
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
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true },
  });
  return membership?.locationId ?? null;
}

export async function getStationsForUser(
  userId: string,
  options?: { activeOnly?: boolean },
): Promise<{ locationId: string; stations: StationRecord[] } | null> {
  const locationId = await getPrimaryLocationIdForUser(userId);
  if (!locationId) return null;
  const stations = await getStationsForLocation(locationId, options);
  return { locationId, stations };
}

export function stationsById(stations: StationRecord[]): Map<string, StationRecord> {
  return new Map(stations.map((s) => [s.id, s]));
}
