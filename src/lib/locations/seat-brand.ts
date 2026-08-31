import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

const BRAND_ROLES: Role[] = ["OWNER", "ADMIN"];

async function joinLocationChannels(locationId: string, userId: string) {
  const channels = await prisma.chatChannel.findMany({
    where: { locationId, isArchived: false },
    select: { id: true },
  });
  for (const channel of channels) {
    await prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId } },
      update: { canPost: true },
      create: { channelId: channel.id, userId, canPost: true },
    });
  }
}

/** Seat an OWNER/ADMIN on every active school in the brand. */
export async function seatBrandLeaderOnOrganization(userId: string, organizationId: string) {
  const locations = await prisma.location.findMany({
    where: { organizationId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (const [index, location] of locations.entries()) {
    const station = await prisma.station.findFirst({
      where: { locationId: location.id, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (!station) continue;

    await prisma.locationMember.upsert({
      where: { locationId_userId: { locationId: location.id, userId } },
      update: {},
      create: {
        locationId: location.id,
        userId,
        stationId: station.id,
        isPrimary: index === 0,
      },
    });
    await joinLocationChannels(location.id, userId);
  }
}

/** Seat every OWNER/ADMIN of the brand onto one school (new location). */
export async function seatBrandLeadersOnLocation(locationId: string, organizationId: string) {
  const station = await prisma.station.findFirst({
    where: { locationId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!station) return;

  const leaders = await prisma.user.findMany({
    where: {
      role: { in: BRAND_ROLES },
      locationMembers: { some: { location: { organizationId } } },
    },
    select: { id: true },
  });

  for (const leader of leaders) {
    await prisma.locationMember.upsert({
      where: { locationId_userId: { locationId, userId: leader.id } },
      update: {},
      create: {
        locationId,
        userId: leader.id,
        stationId: station.id,
        isPrimary: false,
      },
    });
    await joinLocationChannels(locationId, leader.id);
  }
}

/**
 * OWNER/ADMIN of a brand get a seat on every existing school so the switcher
 * can open each pipeline. Does not invent new locations.
 */
export const ensureBrandLeaderSeats = cache(async (actorUserId: string): Promise<void> => {
  const memberships = await prisma.locationMember.findMany({
    where: { userId: actorUserId },
    select: { location: { select: { organizationId: true } } },
  });
  const orgIds = [...new Set(memberships.map((row) => row.location.organizationId))];

  for (const organizationId of orgIds) {
    await seatBrandLeaderOnOrganization(actorUserId, organizationId);
  }
});
