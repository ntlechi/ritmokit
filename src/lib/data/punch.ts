import "server-only";

import type { ShiftStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

const SCHEDULED_SHIFT_STATUSES: ShiftStatus[] = ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"];
const LOOK_BEHIND_MS = 2 * 60 * 60 * 1000;
const LOOK_AHEAD_MS = 6 * 60 * 60 * 1000;
const RECENT_COMPLETION_MS = 24 * 60 * 60 * 1000;

export type PunchState = "no_shift" | "not_started" | "clocked_in" | "on_break" | "clocked_out";

export type PunchLocation = {
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
};

export type PunchShift = {
  id: string;
  locationId: string;
  stationId: string;
  stationNameFr: string;
  stationColorHex: string;
  startsAt: string;
  endsAt: string;
  breakRequiredMinutes: number;
};

export type PunchStatus = {
  state: PunchState;
  shift: PunchShift | null;
  actualStartsAt: string | null;
  actualEndsAt: string | null;
  breakStartedAt: string | null;
  breakEndedAt: string | null;
  breakTakenMinutes: number | null;
  location: PunchLocation | null;
};

const withLocation = {
  location: {
    select: { latitude: true, longitude: true, geofenceRadiusMeters: true },
  },
} as const;

export async function getPunchStatusForUser(userId: string): Promise<PunchStatus> {
  const now = new Date();

  const active = await prisma.shift.findFirst({
    where: { employeeId: userId, actualStartsAt: { not: null }, actualEndsAt: null },
    orderBy: { actualStartsAt: "desc" },
    include: {
      ...withLocation,
      station: { select: { nameFr: true, colorHex: true } },
    },
  });

  const shift =
    active ??
    (await prisma.shift.findFirst({
      where: {
        employeeId: userId,
        status: { in: SCHEDULED_SHIFT_STATUSES },
        actualStartsAt: null,
        startsAt: { gte: new Date(now.getTime() - LOOK_BEHIND_MS), lte: new Date(now.getTime() + LOOK_AHEAD_MS) },
      },
      orderBy: { startsAt: "asc" },
      include: {
      ...withLocation,
      station: { select: { nameFr: true, colorHex: true } },
    },
    })) ??
    (await prisma.shift.findFirst({
      where: { employeeId: userId, actualEndsAt: { gte: new Date(now.getTime() - RECENT_COMPLETION_MS) } },
      orderBy: { actualEndsAt: "desc" },
      include: {
      ...withLocation,
      station: { select: { nameFr: true, colorHex: true } },
    },
    }));

  if (!shift) {
    return {
      state: "no_shift",
      shift: null,
      actualStartsAt: null,
      actualEndsAt: null,
      breakStartedAt: null,
      breakEndedAt: null,
      breakTakenMinutes: null,
      location: null,
    };
  }

  const breakTakenMinutes =
    shift.breakStartedAt && shift.breakEndedAt
      ? Math.round((shift.breakEndedAt.getTime() - shift.breakStartedAt.getTime()) / (60 * 1000))
      : null;

  return {
    state: derivePunchState(shift),
    shift: {
      id: shift.id,
      locationId: shift.locationId,
      stationId: shift.stationId,
      stationNameFr: shift.station.nameFr,
      stationColorHex: shift.station.colorHex,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      breakRequiredMinutes: shift.breakRequiredMinutes,
    },
    actualStartsAt: shift.actualStartsAt?.toISOString() ?? null,
    actualEndsAt: shift.actualEndsAt?.toISOString() ?? null,
    breakStartedAt: shift.breakStartedAt?.toISOString() ?? null,
    breakEndedAt: shift.breakEndedAt?.toISOString() ?? null,
    breakTakenMinutes,
    location: shift.location,
  };
}

function derivePunchState(shift: {
  actualStartsAt: Date | null;
  actualEndsAt: Date | null;
  breakStartedAt: Date | null;
  breakEndedAt: Date | null;
}): PunchState {
  if (shift.actualEndsAt) return "clocked_out";
  if (shift.breakStartedAt && !shift.breakEndedAt) return "on_break";
  if (shift.actualStartsAt) return "clocked_in";
  return "not_started";
}
