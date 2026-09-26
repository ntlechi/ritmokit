import "server-only";

import { prisma } from "@/lib/prisma";
import { getPrimaryMembership } from "@/lib/auth/session";
import { getAccueilRosterForUser, type AccueilRoster } from "@/lib/data/accueil-roster";
import { seasonWeekNumber } from "@/lib/data/course-lessons";
import { loadFirstVisitStudentIds } from "@/lib/data/intake";
import { wallClockLabel } from "@/lib/dance/class-display";
import { isSocialEvent } from "@/lib/dance/door-search";
import { maxImbalanceForCourse } from "@/lib/dance/parity";
import { stationLabel } from "@/lib/stations/display";
import type { Locale } from "@/lib/i18n/config";

const DAYS_AHEAD = 7;

export type TeacherUpcomingClass = {
  key: string;
  sessionId: string;
  courseId: string;
  /** Civil date YYYY-MM-DD at the studio. */
  date: string;
  dayOfWeek: number;
  startLabel: string;
  endLabel: string;
  courseTitle: string;
  style: string;
  level: string;
  roomName: string;
  instructorName: string;
  leads: number;
  follows: number;
  booked: number;
  capacity: number;
  waitlisted: number;
  newStudents: number;
  maxImbalance: number;
  isSocial: boolean;
  lessonWeek: number;
  lessonTitle: string | null;
};

export type TeacherDay = {
  tonight: AccueilRoster | null;
  upcoming: TeacherUpcomingClass[];
};

function civilDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDays(date: string, days: number): { date: string; dow: number } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days, 12));
  return { date: next.toISOString().slice(0, 10), dow: next.getUTCDay() };
}

/**
 * Everything one teacher needs: tonight's classes (roster, lesson, balance)
 * and the next 7 days of their own classes with the plan for each week.
 */
export async function getTeacherDayForUser(
  userId: string,
  options?: { locale?: Locale; now?: Date },
): Promise<TeacherDay> {
  const locale = options?.locale ?? "fr";
  const now = options?.now ?? new Date();

  const [tonight, membership] = await Promise.all([
    getAccueilRosterForUser(userId, { locale, date: now, teacherUserId: userId }),
    getPrimaryMembership(userId),
  ]);
  if (!membership) return { tonight, upcoming: [] };

  const timeZone = membership.location.timezone || "America/Toronto";
  const today = civilDate(now, timeZone);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i + 1));
  const windowStart = new Date(`${days[0]!.date}T00:00:00.000Z`);
  const windowEnd = new Date(`${addDays(today, DAYS_AHEAD + 1).date}T00:00:00.000Z`);
  const locationId = membership.locationId;

  const sessions = await prisma.classSession.findMany({
    where: {
      AND: [
        { OR: [{ instructorId: userId }, { assistantId: userId }] },
        {
          OR: [
            {
              season: { locationId, status: "ACTIVE" },
              dayOfWeek: { in: [...new Set(days.map((d) => d.dow))] },
            },
            {
              seasonId: null,
              room: { locationId },
              dayOfWeek: null,
              startTime: { gte: windowStart, lt: windowEnd },
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      maxLeads: true,
      maxFollows: true,
      course: { select: { id: true, title: true, style: true, level: true } },
      season: { select: { startsOn: true, endsOn: true } },
      room: { select: { nameFr: true, nameEn: true, nameEs: true } },
      instructor: { select: { fullName: true } },
      enrollments: {
        where: { paymentStatus: { not: "CANCELLED_INTERAC" } },
        select: { studentId: true, danceRole: true, waitlisted: true },
      },
    },
  });

  type Occurrence = { session: (typeof sessions)[number]; date: string; dow: number };
  const occurrences: Occurrence[] = [];
  for (const session of sessions) {
    if (session.dayOfWeek == null) {
      const date = session.startTime.toISOString().slice(0, 10);
      const day = days.find((d) => d.date === date);
      if (day) occurrences.push({ session, date, dow: day.dow });
      continue;
    }
    for (const day of days) {
      if (day.dow !== session.dayOfWeek) continue;
      const iso = day.date;
      if (session.season) {
        const starts = session.season.startsOn.toISOString().slice(0, 10);
        const ends = session.season.endsOn.toISOString().slice(0, 10);
        if (iso < starts || iso > ends) continue;
      }
      occurrences.push({ session, date: iso, dow: day.dow });
    }
  }

  const weekFor = (o: Occurrence) =>
    o.session.season ? seasonWeekNumber(o.session.season.startsOn, new Date(`${o.date}T12:00:00Z`)) : 1;
  const courseIds = [...new Set(occurrences.map((o) => o.session.course.id))];
  const maxWeek = Math.max(1, ...occurrences.map(weekFor));

  const [lessons, firstVisitIds] = await Promise.all([
    courseIds.length
      ? prisma.courseLesson.findMany({
          where: { courseId: { in: courseIds }, weekNumber: { lte: maxWeek } },
          select: { courseId: true, weekNumber: true, title: true },
          orderBy: { weekNumber: "desc" },
        })
      : Promise.resolve([]),
    loadFirstVisitStudentIds(
      locationId,
      sessions.flatMap((s) => s.enrollments.filter((e) => !e.waitlisted).map((e) => e.studentId)),
      now,
    ),
  ]);

  const upcoming = occurrences.map((o): TeacherUpcomingClass => {
    const { session } = o;
    const seated = session.enrollments.filter((e) => !e.waitlisted);
    const lessonWeek = weekFor(o);
    const lesson =
      lessons.find((l) => l.courseId === session.course.id && l.weekNumber === lessonWeek) ?? null;
    return {
      key: `${session.id}:${o.date}`,
      sessionId: session.id,
      courseId: session.course.id,
      date: o.date,
      dayOfWeek: o.dow,
      startLabel: wallClockLabel(session.startTime.toISOString()),
      endLabel: wallClockLabel(session.endTime.toISOString()),
      courseTitle: session.course.title,
      style: session.course.style,
      level: session.course.level,
      roomName: stationLabel(session.room, locale),
      instructorName: session.instructor.fullName,
      leads: seated.filter((e) => e.danceRole === "LEAD").length,
      follows: seated.filter((e) => e.danceRole === "FOLLOW").length,
      booked: seated.length,
      capacity: session.maxLeads + session.maxFollows,
      waitlisted: session.enrollments.length - seated.length,
      newStudents: seated.filter((e) => firstVisitIds.has(e.studentId)).length,
      maxImbalance: maxImbalanceForCourse(session.course),
      isSocial: isSocialEvent(session.course.style, session.course.title),
      lessonWeek,
      lessonTitle: lesson?.title ?? null,
    };
  });

  upcoming.sort((a, b) => (a.date === b.date ? a.startLabel.localeCompare(b.startLabel) : a.date.localeCompare(b.date)));

  return { tonight, upcoming };
}
