/**
 * Student evolution — attendance rate + ready-for-next-level.
 * Works for partner dance and solo/fitness (SOLO role, style = yoga/etc).
 */
import "server-only";

import type { CourseLevel, DanceRole, ProgressionStatus } from "@/generated/prisma/enums";
import { seasonWeekNumber } from "@/lib/data/course-lessons";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import { prisma } from "@/lib/prisma";

export function nextCourseLevel(level: CourseLevel): CourseLevel | null {
  if (level === "BEGINNER") return "INTERMEDIATE";
  if (level === "INTERMEDIATE") return "ADVANCED";
  return null;
}

export function isChurnRisk(input: {
  status: ProgressionStatus;
  attendanceRate: number;
  expectedWeeks: number;
}): boolean {
  if (input.status === "COMPLETED" || input.status === "READY_TO_ADVANCE") return false;
  return input.expectedWeeks >= 3 && input.attendanceRate < 0.4;
}

export function civilDateInTimeZone(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "01";
  return new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
}

export async function recordClassAttendance(input: {
  enrollmentId: string;
  attended: boolean;
  occurredOn: Date;
}): Promise<void> {
  const day = new Date(
    Date.UTC(input.occurredOn.getUTCFullYear(), input.occurredOn.getUTCMonth(), input.occurredOn.getUTCDate()),
  );

  await prisma.classAttendance.upsert({
    where: {
      enrollmentId_occurredOn: {
        enrollmentId: input.enrollmentId,
        occurredOn: day,
      },
    },
    create: {
      enrollmentId: input.enrollmentId,
      occurredOn: day,
      attended: input.attended,
    },
    update: { attended: input.attended },
  });

  await refreshProgressionForEnrollment(input.enrollmentId);
}

export async function refreshProgressionForEnrollment(enrollmentId: string): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      studentId: true,
      danceRole: true,
      waitlisted: true,
      session: {
        select: {
          seasonId: true,
          course: { select: { id: true, style: true, level: true } },
          season: { select: { id: true, locationId: true, startsOn: true } },
          room: { select: { locationId: true } },
        },
      },
    },
  });
  if (!enrollment || enrollment.waitlisted) return;
  const season = enrollment.session.season;
  if (!season || !enrollment.session.seasonId) return;

  const locationId = season.locationId || enrollment.session.room.locationId;
  await upsertProgressionAttendance({
    studentId: enrollment.studentId,
    courseId: enrollment.session.course.id,
    seasonId: season.id,
    locationId,
    danceStyle: enrollment.session.course.style,
    currentLevel: enrollment.session.course.level,
    danceRole: enrollment.danceRole,
    seasonStartsOn: season.startsOn,
  });
}

async function upsertProgressionAttendance(input: {
  studentId: string;
  courseId: string;
  seasonId: string;
  locationId: string;
  danceStyle: string;
  currentLevel: CourseLevel;
  danceRole: DanceRole;
  seasonStartsOn: Date;
}): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: input.studentId,
      waitlisted: false,
      paymentStatus: { not: "CANCELLED_INTERAC" },
      session: { courseId: input.courseId, seasonId: input.seasonId },
    },
    select: { id: true },
  });
  const ids = enrollments.map((e) => e.id);
  const attendedCount =
    ids.length === 0
      ? 0
      : await prisma.classAttendance.count({
          where: { enrollmentId: { in: ids }, attended: true },
        });

  const expectedWeeks = Math.max(1, seasonWeekNumber(input.seasonStartsOn, new Date()));
  const attendanceRate = Math.min(1, attendedCount / expectedWeeks);

  const existing = await prisma.studentProgression.findUnique({
    where: {
      studentId_courseId_seasonId: {
        studentId: input.studentId,
        courseId: input.courseId,
        seasonId: input.seasonId,
      },
    },
    select: { status: true },
  });

  const keepStatus =
    existing?.status === "READY_TO_ADVANCE" ||
    existing?.status === "COMPLETED" ||
    existing?.status === "NEEDS_REVIEW";

  await prisma.studentProgression.upsert({
    where: {
      studentId_courseId_seasonId: {
        studentId: input.studentId,
        courseId: input.courseId,
        seasonId: input.seasonId,
      },
    },
    create: {
      studentId: input.studentId,
      courseId: input.courseId,
      seasonId: input.seasonId,
      locationId: input.locationId,
      danceStyle: input.danceStyle,
      currentLevel: input.currentLevel,
      danceRole: input.danceRole,
      status: "IN_PROGRESS",
      attendanceRate,
      attendedCount,
      expectedWeeks,
    },
    update: {
      danceStyle: input.danceStyle,
      currentLevel: input.currentLevel,
      danceRole: input.danceRole,
      attendanceRate,
      attendedCount,
      expectedWeeks,
      ...(keepStatus ? {} : { status: "IN_PROGRESS" as const }),
    },
  });
}

/** Fill evolution rows from existing seated enrollments (CRM / first Accueil). */
export async function ensureProgressionsForLocation(locationId: string): Promise<number> {
  await ensureStudioOsSchema();
  const rows = await prisma.enrollment.findMany({
    where: {
      waitlisted: false,
      paymentStatus: { not: "CANCELLED_INTERAC" },
      session: {
        seasonId: { not: null },
        OR: [{ season: { locationId } }, { room: { locationId } }],
      },
    },
    select: {
      id: true,
      studentId: true,
      danceRole: true,
      session: {
        select: {
          course: { select: { id: true, style: true, level: true } },
          season: { select: { id: true, locationId: true, startsOn: true } },
        },
      },
    },
    take: 2500,
  });

  const seen = new Set<string>();
  let created = 0;
  for (const row of rows) {
    const season = row.session.season;
    if (!season) continue;
    const key = `${row.studentId}:${row.session.course.id}:${season.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await upsertProgressionAttendance({
      studentId: row.studentId,
      courseId: row.session.course.id,
      seasonId: season.id,
      locationId: season.locationId || locationId,
      danceStyle: row.session.course.style,
      currentLevel: row.session.course.level,
      danceRole: row.danceRole,
      seasonStartsOn: season.startsOn,
    });
    created += 1;
  }
  return created;
}
