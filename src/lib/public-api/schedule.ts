import "server-only";

import { asPlainNumber } from "@/lib/data/serialize";
import { getClassAvailability, getPackagePeers, type RoleCapacity } from "@/lib/dance/parity";
import { prisma } from "@/lib/prisma";
import { stationLabel } from "@/lib/stations/display";
import type { CourseLevel } from "@/generated/prisma/enums";

export type PublicScheduleQuery = {
  locationId: string;
  level?: CourseLevel | null;
  style?: string | null;
  dayOfWeek?: number | null;
};

export type PublicScheduleClass = {
  id: string;
  seasonId: string | null;
  seasonName: string | null;
  courseId: string;
  title: string;
  level: string;
  style: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  room: {
    id: string;
    name: string;
    capacity: number | null;
    surfaceSqm: number | null;
  };
  instructor: {
    id: string;
    fullName: string;
  };
  pricing: {
    regular: number;
    couple: number | null;
    student: number | null;
  };
  capacity: {
    maxLeads: number;
    maxFollows: number;
    leadsFilled: number;
    followsFilled: number;
    leadsFree: number;
    followsFree: number;
    imbalance: number;
    full: boolean;
  };
  /** Same course title across weekdays — one payment package. */
  packageClassIds: string[];
  isPackage: boolean;
  packageCount: number;
};

function countRoles(
  enrollments: Array<{
    danceRole: "LEAD" | "FOLLOW" | "SOLO";
    waitlisted: boolean;
    paymentStatus?: string;
  }>,
): Pick<RoleCapacity, "filledLeads" | "filledFollows"> {
  let filledLeads = 0;
  let filledFollows = 0;
  for (const e of enrollments) {
    if (e.waitlisted) continue;
    if (e.paymentStatus === "CANCELLED_INTERAC") continue;
    if (e.danceRole === "LEAD") filledLeads += 1;
    else if (e.danceRole === "FOLLOW") filledFollows += 1;
  }
  return { filledLeads, filledFollows };
}

export async function getPublicSchedule(
  query: PublicScheduleQuery,
): Promise<{
  locationId: string;
  season: { id: string; name: string; startsOn: string; endsOn: string } | null;
  classes: PublicScheduleClass[];
}> {
  const activeSeason = await prisma.sessionSeason.findFirst({
    where: {
      locationId: query.locationId,
      status: "ACTIVE",
      bookingOpen: true,
    },
    orderBy: { startsOn: "desc" },
  });

  const seasonFilter = activeSeason
    ? {
        OR: [
          { seasonId: activeSeason.id },
          { seasonId: null, room: { locationId: query.locationId } },
        ],
      }
    : { room: { locationId: query.locationId } };

  const rows = await prisma.classSession.findMany({
    where: {
      ...seasonFilter,
      ...(query.dayOfWeek != null ? { dayOfWeek: query.dayOfWeek } : {}),
      course: {
        ...(query.level ? { level: query.level } : {}),
        ...(query.style
          ? { style: { equals: query.style, mode: "insensitive" as const } }
          : {}),
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: {
      course: true,
      season: { select: { id: true, name: true } },
      room: true,
      instructor: { select: { id: true, fullName: true } },
      enrollments: { select: { danceRole: true, waitlisted: true, paymentStatus: true } },
    },
  });

  const peerInput = rows.map((row) => ({
    id: row.id,
    courseTitle: row.course.title,
  }));

  const classes: PublicScheduleClass[] = rows.map((row) => {
    const filled = countRoles(row.enrollments);
    const cap: RoleCapacity = {
      maxLeads: row.maxLeads,
      maxFollows: row.maxFollows,
      ...filled,
    };
    const availability = getClassAvailability(cap);
    const peers = getPackagePeers(peerInput, {
      id: row.id,
      courseTitle: row.course.title,
    });

    return {
      id: row.id,
      seasonId: row.seasonId,
      seasonName: row.season?.name ?? null,
      courseId: row.courseId,
      title: row.course.title,
      level: row.course.level,
      style: row.course.style,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      room: {
        id: row.room.id,
        name: stationLabel(row.room, "fr"),
        capacity: row.room.capacity,
        surfaceSqm: row.room.surfaceSqm,
      },
      instructor: {
        id: row.instructor.id,
        fullName: row.instructor.fullName,
      },
      pricing: {
        regular: asPlainNumber(row.priceRegular),
        couple: row.priceCouple != null ? asPlainNumber(row.priceCouple) : null,
        student: row.priceStudent != null ? asPlainNumber(row.priceStudent) : null,
      },
      capacity: {
        maxLeads: availability.maxLeads,
        maxFollows: availability.maxFollows,
        leadsFilled: availability.leadsFilled,
        followsFilled: availability.followsFilled,
        leadsFree: availability.leadsFree,
        followsFree: availability.followsFree,
        imbalance: availability.imbalance,
        full: availability.full,
      },
      packageClassIds: peers.map((p) => p.id),
      isPackage: peers.length > 1,
      packageCount: peers.length,
    };
  });

  return {
    locationId: query.locationId,
    season: activeSeason
      ? {
          id: activeSeason.id,
          name: activeSeason.name,
          startsOn: activeSeason.startsOn.toISOString().slice(0, 10),
          endsOn: activeSeason.endsOn.toISOString().slice(0, 10),
        }
      : null,
    classes,
  };
}
