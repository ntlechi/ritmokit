import "server-only";

import { prisma } from "@/lib/prisma";
import { resolvePublicLocation } from "@/lib/public-api/tenant";
import { getPackagePeers } from "@/lib/dance/parity";
import { hhmmFromUtcDate } from "@/lib/rentals/wall-time";
import { stationLabel } from "@/lib/stations/display";

export async function getPublicSessions(input: {
  locationId?: string | null;
  locationSlug?: string | null;
  organizationSlug?: string | null;
}) {
  const location = await resolvePublicLocation(input);
  if (!location) return { ok: false as const, error: "location_not_found", status: 404 };

  const seasons = await prisma.sessionSeason.findMany({
    where: {
      locationId: location.id,
      status: { in: ["ACTIVE", "DRAFT"] },
    },
    orderBy: [{ startsOn: "desc" }],
    take: 20,
    select: {
      id: true,
      name: true,
      status: true,
      bookingOpen: true,
      publishOn: true,
      startsOn: true,
      endsOn: true,
      _count: { select: { classes: true } },
    },
  });

  const now = new Date();
  const items = seasons
    .filter((s) => {
      if (s.status === "ACTIVE") return true;
      // Upcoming draft: published or publish date reached.
      if (s.publishOn && s.publishOn <= now) return true;
      return s.startsOn >= now;
    })
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status.toLowerCase(),
      bookingOpen: s.bookingOpen,
      publishOn: s.publishOn?.toISOString().slice(0, 10) ?? null,
      startsOn: s.startsOn.toISOString().slice(0, 10),
      endsOn: s.endsOn.toISOString().slice(0, 10),
      classCount: s._count.classes,
    }));

  return {
    ok: true as const,
    locationId: location.id,
    sessions: items,
  };
}

export async function getPublicAnnouncements(input: {
  locationId?: string | null;
  locationSlug?: string | null;
  organizationSlug?: string | null;
}) {
  const location = await resolvePublicLocation(input);
  if (!location) return { ok: false as const, error: "location_not_found", status: 404 };

  const now = new Date();
  const rows = await prisma.studioAnnouncement.findMany({
    where: {
      locationId: location.id,
      isActive: true,
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }],
    take: 50,
  });

  return {
    ok: true as const,
    locationId: location.id,
    announcements: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      publishedAt: r.publishedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
    })),
  };
}

export async function getPublicEvents(input: {
  locationId?: string | null;
  locationSlug?: string | null;
  organizationSlug?: string | null;
}) {
  const location = await resolvePublicLocation(input);
  if (!location) return { ok: false as const, error: "location_not_found", status: 404 };

  const rows = await prisma.studioPublicEvent.findMany({
    where: {
      locationId: location.id,
      isActive: true,
      status: { in: ["active", "ACTIVE", "published"] },
    },
    orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }],
    take: 50,
  });

  return {
    ok: true as const,
    locationId: location.id,
    events: rows.map((r) => ({
      id: r.id,
      title: r.title,
      shortLabel: r.shortLabel,
      description: r.description,
      scale: r.scale,
      status: r.status,
      bookingOpen: r.bookingOpen,
      startsOn: r.startsOn.toISOString().slice(0, 10),
      endsOn: r.endsOn.toISOString().slice(0, 10),
      venue: r.venue,
      ticketUrl: r.ticketUrl,
      payload: r.payload,
    })),
  };
}

/** Enrich schedule classes with packagePeerIds (same course title in season). */
export async function attachPackagePeers(
  classes: Array<{
    id: string;
    courseId: string;
    title: string;
    dayOfWeek: number | null;
    startTime: string;
  }>,
) {
  const peersByTitle = new Map<string, typeof classes>();
  for (const cls of classes) {
    const key = cls.title.trim().toLowerCase();
    const list = peersByTitle.get(key) ?? [];
    list.push(cls);
    peersByTitle.set(key, list);
  }

  return classes.map((cls) => {
    const peers = getPackagePeers(
      [...(peersByTitle.get(cls.title.trim().toLowerCase()) ?? [])].map((c) => ({
        id: c.id,
        courseTitle: c.title,
      })),
      { id: cls.id, courseTitle: cls.title },
    );
    return {
      ...cls,
      packageClassIds: peers.map((p) => p.id),
      isPackage: peers.length > 1,
      packageCount: peers.length,
    };
  });
}

export { hhmmFromUtcDate, stationLabel };
