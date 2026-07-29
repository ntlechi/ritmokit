import "server-only";

import { asPlainNumber } from "@/lib/data/serialize";
import { getClassAvailability, type RoleCapacity } from "@/lib/dance/parity";
import { prisma } from "@/lib/prisma";
import { stationLabel } from "@/lib/stations/display";
import type { Locale } from "@/lib/i18n/config";

export type DanceEnrollmentRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  danceRole: "LEAD" | "FOLLOW" | "SOLO";
  paid: boolean;
  waitlisted: boolean;
  attended: boolean;
};

export type DanceClassRow = {
  id: string;
  seasonId: string | null;
  courseId: string;
  courseTitle: string;
  courseLevel: string;
  courseStyle: string;
  roomId: string;
  roomName: string;
  instructorId: string;
  instructorName: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  maxLeads: number;
  maxFollows: number;
  priceRegular: number;
  priceCouple: number | null;
  priceStudent: number | null;
  leadsFilled: number;
  followsFilled: number;
  waitlistedCount: number;
  imbalance: number;
  enrollments: DanceEnrollmentRow[];
};

export type DanceSeasonRow = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  bookingOpen: boolean;
  publishOn: string | null;
  startsOn: string;
  endsOn: string;
  classCount: number;
};

export type DanceStudentOption = {
  id: string;
  fullName: string;
  email: string;
};

export type DanceInstructorOption = {
  id: string;
  fullName: string;
};

export type DanceCourseOption = {
  id: string;
  title: string;
  level: string;
  style: string;
};

export type DanceRoomOption = {
  id: string;
  name: string;
  capacity: number | null;
  surfaceSqm: number | null;
};

export type DanceAdminBundle = {
  locationId: string;
  organizationId: string;
  seasons: DanceSeasonRow[];
  classes: DanceClassRow[];
  courses: DanceCourseOption[];
  rooms: DanceRoomOption[];
  instructors: DanceInstructorOption[];
  students: DanceStudentOption[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toIsoDateTime(d: Date): string {
  return d.toISOString();
}

export async function getDanceAdminBundle(
  userId: string,
  locale: Locale,
): Promise<DanceAdminBundle | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      locationId: true,
      location: { select: { organizationId: true } },
    },
  });
  if (!membership) return null;

  const { locationId } = membership;
  const organizationId = membership.location.organizationId;

  const [seasons, classRows, courses, rooms, instructors, students] = await Promise.all([
    prisma.sessionSeason.findMany({
      where: { locationId },
      orderBy: [{ startsOn: "desc" }],
      include: { _count: { select: { classes: true } } },
    }),
    prisma.classSession.findMany({
      where: {
        OR: [
          { season: { locationId } },
          { room: { locationId } },
        ],
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: {
        course: true,
        room: true,
        instructor: { select: { id: true, fullName: true } },
        enrollments: {
          include: { student: { select: { id: true, fullName: true, email: true } } },
          orderBy: [{ waitlisted: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.course.findMany({
      where: { organizationId },
      orderBy: [{ style: "asc" }, { level: "asc" }, { title: "asc" }],
    }),
    prisma.station.findMany({
      where: { locationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ["INSTRUCTOR", "MANAGER", "OWNER", "ADMIN"] } },
          { locationMembers: { some: { locationId } } },
        ],
        instructorPayType: { not: null },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { role: "STUDENT" },
          { locationMembers: { some: { locationId } } },
        ],
      },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: "asc" },
      take: 200,
    }),
  ]);

  // Fallback instructors: all location members if none have instructorPayType
  let instructorOptions = instructors;
  if (instructorOptions.length === 0) {
    instructorOptions = await prisma.user.findMany({
      where: {
        locationMembers: { some: { locationId } },
        role: { in: ["INSTRUCTOR", "MANAGER", "OWNER", "ADMIN", "EMPLOYEE"] },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
      take: 100,
    });
  }

  const classes: DanceClassRow[] = classRows.map((row) => {
    let filledLeads = 0;
    let filledFollows = 0;
    let waitlistedCount = 0;
    for (const e of row.enrollments) {
      if (e.waitlisted) {
        waitlistedCount += 1;
        continue;
      }
      if (e.danceRole === "LEAD") filledLeads += 1;
      else if (e.danceRole === "FOLLOW") filledFollows += 1;
    }
    const cap: RoleCapacity = {
      maxLeads: row.maxLeads,
      maxFollows: row.maxFollows,
      filledLeads,
      filledFollows,
    };
    const availability = getClassAvailability(cap);

    return {
      id: row.id,
      seasonId: row.seasonId,
      courseId: row.courseId,
      courseTitle: row.course.title,
      courseLevel: row.course.level,
      courseStyle: row.course.style,
      roomId: row.roomId,
      roomName: stationLabel(row.room, locale),
      instructorId: row.instructorId,
      instructorName: row.instructor.fullName,
      dayOfWeek: row.dayOfWeek,
      startTime: toIsoDateTime(row.startTime),
      endTime: toIsoDateTime(row.endTime),
      maxLeads: row.maxLeads,
      maxFollows: row.maxFollows,
      priceRegular: asPlainNumber(row.priceRegular),
      priceCouple: row.priceCouple != null ? asPlainNumber(row.priceCouple) : null,
      priceStudent: row.priceStudent != null ? asPlainNumber(row.priceStudent) : null,
      leadsFilled: filledLeads,
      followsFilled: filledFollows,
      waitlistedCount,
      imbalance: availability.imbalance,
      enrollments: row.enrollments.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        studentName: e.student.fullName,
        studentEmail: e.student.email,
        danceRole: e.danceRole,
        paid: e.paid,
        waitlisted: e.waitlisted,
        attended: e.attended,
      })),
    };
  });

  return {
    locationId,
    organizationId,
    seasons: seasons.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      bookingOpen: s.bookingOpen,
      publishOn: s.publishOn ? toIsoDate(s.publishOn) : null,
      startsOn: toIsoDate(s.startsOn),
      endsOn: toIsoDate(s.endsOn),
      classCount: s._count.classes,
    })),
    classes,
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      level: c.level,
      style: c.style,
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: stationLabel(r, locale),
      capacity: r.capacity,
      surfaceSqm: r.surfaceSqm,
    })),
    instructors: instructorOptions.map((i) => ({ id: i.id, fullName: i.fullName })),
    students: students.map((s) => ({ id: s.id, fullName: s.fullName, email: s.email })),
  };
}
