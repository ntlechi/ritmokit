import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import { getPulseWeekBounds } from "@/lib/pulse/week";
import { getStationsForLocation } from "@/lib/data/stations";
import type { StationRecord } from "@/lib/stations/display";

export type ShoutOutTeammate = {
  userId: string;
  fullName: string;
  stationId: string;
  stationColorHex: string | null;
  profilePictureUrl: string | null;
};

export type ShoutOutComposerContext = {
  locationId: string;
  stationId: string;
  stations: StationRecord[];
  teammates: ShoutOutTeammate[];
  values: Array<{ valueKey: string; title: string }>;
  recentReceived: Array<{
    id: string;
    senderName: string;
    valueKey: string;
    valueTitle: string | null;
    message: string;
    createdAt: string;
  }>;
};

function pickValueTitle(
  row: { titleFr: string; titleEn: string; titleEs: string } | undefined,
  lang: Locale,
): string | null {
  if (!row) return null;
  if (lang === "en") return row.titleEn;
  if (lang === "es") return row.titleEs;
  return row.titleFr;
}

/** Contexte mobile : collègues de la même succursale + valeurs actives. */
export async function getShoutOutComposerContext(
  userId: string,
  lang: Locale,
): Promise<ShoutOutComposerContext | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: { select: { id: true, organizationId: true } },
    },
  });
  if (!membership) return null;

  const { start } = getPulseWeekBounds();

  const [stations, teammates, values, recent] = await Promise.all([
    getStationsForLocation(membership.locationId),
    prisma.locationMember.findMany({
      where: {
        locationId: membership.locationId,
        userId: { not: userId },
        user: { role: { in: ["EMPLOYEE", "MANAGER"] } },
      },
      include: {
        user: {
          select: { id: true, fullName: true, profilePictureUrl: true },
        },
        station: { select: { colorHex: true } },
      },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.organizationValue.findMany({
      where: { organizationId: membership.location.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.stationShoutOut.findMany({
      where: {
        locationId: membership.locationId,
        receiverId: userId,
        createdAt: { gte: start },
      },
      include: {
        sender: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const valueMap = new Map(values.map((v) => [v.valueKey, v]));

  return {
    locationId: membership.locationId,
    stationId: membership.stationId,
    stations,
    teammates: teammates.map((m) => ({
      userId: m.user.id,
      fullName: m.user.fullName,
      stationId: m.stationId,
      stationColorHex: m.station?.colorHex ?? null,
      profilePictureUrl: m.user.profilePictureUrl,
    })),
    values: values.map((v) => ({
      valueKey: v.valueKey,
      title: pickValueTitle(v, lang) ?? v.valueKey,
    })),
    recentReceived: recent.map((row) => ({
      id: row.id,
      senderName: row.sender.fullName,
      valueKey: row.valueKey,
      valueTitle: pickValueTitle(valueMap.get(row.valueKey), lang),
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export type ShoutOutWeekStats = {
  count: number;
  byValue: Array<{ valueKey: string; count: number }>;
};

export async function getShoutOutWeekStats(locationId: string): Promise<ShoutOutWeekStats> {
  const { start, end } = getPulseWeekBounds();
  const rows = await prisma.stationShoutOut.groupBy({
    by: ["valueKey"],
    where: {
      locationId,
      createdAt: { gte: start, lt: end },
    },
    _count: { _all: true },
  });

  const byValue = rows
    .map((r) => ({ valueKey: r.valueKey, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
  const count = byValue.reduce((sum, r) => sum + r.count, 0);
  return { count, byValue };
}
