import "server-only";

import { prisma } from "@/lib/prisma";
import { getPrimaryMembership } from "@/lib/auth/session";
import { loadDrawerSnapshot, type DrawerSnapshot } from "@/lib/data/cash-drawer";
import { seasonWeekNumber } from "@/lib/data/course-lessons";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import { isSocialEvent } from "@/lib/dance/door-search";
import { stationLabel } from "@/lib/stations/display";
import type { Locale } from "@/lib/i18n/config";

export type AccueilRosterRow = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  danceRole: "LEAD" | "FOLLOW" | "SOLO";
  paid: boolean;
  waitlisted: boolean;
  attended: boolean;
  /** Waitlist promote unpaid chase priority. */
  promotedUnpaid: boolean;
  pricingTier: "REGULAR" | "STUDENT" | "COUPLE" | "UNLIMITED_PASS";
  progressionStatus: "IN_PROGRESS" | "READY_TO_ADVANCE" | "COMPLETED" | "NEEDS_REVIEW" | null;
  attendanceLabel: string | null;
  showEval: boolean;
  ticketCode: string | null;
};

export type AccueilClassCard = {
  sessionId: string;
  courseTitle: string;
  style: string;
  level: string;
  roomName: string;
  roomColorHex: string;
  /** Projected start Instant for "today" (ISO). */
  startTime: string;
  endTime: string;
  startLabel: string;
  endLabel: string;
  instructorName: string;
  leads: { filled: number; max: number; present: number };
  follows: { filled: number; max: number; present: number };
  waitlistedCount: number;
  unpaidCount: number;
  notCheckedInCount: number;
  presentCount: number;
  isSocial: boolean;
  /** upcoming | live | done */
  status: "upcoming" | "live" | "done";
  roster: AccueilRosterRow[];
  tonightPlan: {
    weekNumber: number;
    title: string;
    body: string;
    musicNote: string | null;
    leadFocus: string | null;
    followFocus: string | null;
  } | null;
  planWeek: number;
};

export type AccueilRoster = {
  locationId: string;
  locationName: string;
  timezone: string;
  date: string;
  generatedAt: string;
  classes: AccueilClassCard[];
  /** Tonight's door money for the end-of-night drawer close. */
  drawer: DrawerSnapshot;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function hmUtc(dt: Date) {
  return { h: dt.getUTCHours(), m: dt.getUTCMinutes() };
}

function formatHm(h: number, m: number) {
  return `${pad2(h)}:${pad2(m)}`;
}

function civilInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday");
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    dow: dowMap[weekday] ?? now.getUTCDay(),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** Approximate Instant for a civil wall-clock in a TZ (good enough for sort/status). */
function civilDateTimeToIso(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const probe = new Date(utcGuess);
  const local = civilInTimeZone(probe, timeZone);
  const desiredMinutes = hour * 60 + minute;
  const actualMinutes = local.hour * 60 + local.minute;
  const deltaMin = desiredMinutes - actualMinutes;
  // Also correct day drift if the probe landed on a different civil day.
  const desiredDayKey = `${year}-${pad2(month)}-${pad2(day)}`;
  let dayDelta = 0;
  if (local.date !== desiredDayKey) {
    dayDelta = local.date > desiredDayKey ? -1 : 1;
  }
  return new Date(utcGuess + (deltaMin + dayDelta * 24 * 60) * 60_000).toISOString();
}

function classStatus(
  nowMin: number,
  startMin: number,
  endMin: number,
): "upcoming" | "live" | "done" {
  if (nowMin >= endMin) return "done";
  if (nowMin >= startMin - 15) return nowMin >= startMin ? "live" : "upcoming";
  return "upcoming";
}

export async function getAccueilRosterForUser(
  userId: string,
  options?: { date?: Date; locale?: Locale },
): Promise<AccueilRoster | null> {
  const locale = options?.locale ?? "fr";
  const now = options?.date ?? new Date();

  // Follows the location switcher cookie (multi-site owners) — same resolver as
  // every other staff surface, so the door and the Interac queue agree.
  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const timeZone = membership.location.timezone || "America/Toronto";
  const civil = civilInTimeZone(now, timeZone);
  const nowMin = civil.hour * 60 + civil.minute;
  const dayStartIso = civilDateTimeToIso(timeZone, civil.year, civil.month, civil.day, 0, 0);
  const dayStart = new Date(dayStartIso);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  await ensureStudioOsSchema();

  // Tonight only, decided in SQL: recurring classes on this weekday, plus dated
  // one-offs inside today's civil window. Narrow selects — the tablet gets the
  // fields it renders, nothing else.
  const sessions = await prisma.classSession.findMany({
    where: {
      OR: [
        { season: { locationId: membership.locationId, status: "ACTIVE" } },
        { room: { locationId: membership.locationId }, seasonId: null },
      ],
      AND: [
        {
          OR: [
            { dayOfWeek: civil.dow },
            { dayOfWeek: null, startTime: { gte: dayStart, lt: dayEnd } },
          ],
        },
      ],
    },
    select: {
      id: true,
      seasonId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      maxLeads: true,
      maxFollows: true,
      course: { select: { id: true, title: true, style: true, level: true } },
      season: { select: { id: true, startsOn: true } },
      room: {
        select: {
          nameFr: true,
          nameEn: true,
          nameEs: true,
          colorHex: true,
          locationId: true,
        },
      },
      instructor: { select: { fullName: true } },
      enrollments: {
        where: { paymentStatus: { not: "CANCELLED_INTERAC" } },
        select: {
          id: true,
          danceRole: true,
          paid: true,
          waitlisted: true,
          attended: true,
          promotedAt: true,
          pricingTier: true,
          ticketCode: true,
          student: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ waitlisted: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { startTime: "asc" },
  });

  const tonight = sessions.filter((s) => s.room.locationId === membership.locationId);

  // Batched side data: one query for evolution rows, one for lesson plans.
  const courseIds = [...new Set(tonight.map((s) => s.course.id))];
  const seasonIds = [...new Set(tonight.map((s) => s.seasonId).filter((id): id is string => !!id))];
  const planWeekBySession = new Map(
    tonight.map((s) => [
      s.id,
      s.season?.startsOn
        ? seasonWeekNumber(s.season.startsOn, new Date(`${civil.date}T12:00:00`))
        : 1,
    ]),
  );
  const maxPlanWeek = Math.max(1, ...planWeekBySession.values());

  const [progressions, lessons] = await Promise.all([
    seasonIds.length && courseIds.length
      ? prisma.studentProgression.findMany({
          where: {
            locationId: membership.locationId,
            seasonId: { in: seasonIds },
            courseId: { in: courseIds },
          },
          select: {
            studentId: true,
            courseId: true,
            seasonId: true,
            status: true,
            attendedCount: true,
            expectedWeeks: true,
          },
        })
      : Promise.resolve([]),
    courseIds.length
      ? prisma.courseLesson.findMany({
          where: { courseId: { in: courseIds }, weekNumber: { lte: maxPlanWeek } },
          select: {
            courseId: true,
            weekNumber: true,
            title: true,
            body: true,
            musicNote: true,
            leadFocus: true,
            followFocus: true,
          },
          orderBy: { weekNumber: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const progressionByKey = new Map(
    progressions.map((p) => [`${p.studentId}:${p.courseId}:${p.seasonId}`, p]),
  );
  // Sorted desc → first hit with weekNumber ≤ planWeek is "tonight or latest before".
  const lessonFor = (courseId: string, planWeek: number) =>
    lessons.find((l) => l.courseId === courseId && l.weekNumber <= planWeek) ?? null;

  const cards: AccueilClassCard[] = [];

  for (const session of tonight) {
    const startHm = hmUtc(session.startTime);
    const endHm = hmUtc(session.endTime);

    const startIso = civilDateTimeToIso(
      timeZone,
      civil.year,
      civil.month,
      civil.day,
      startHm.h,
      startHm.m,
    );
    const endIso = civilDateTimeToIso(
      timeZone,
      civil.year,
      civil.month,
      civil.day,
      endHm.h,
      endHm.m,
    );

    let leadsFilled = 0;
    let followsFilled = 0;
    let leadsPresent = 0;
    let followsPresent = 0;
    let presentCount = 0;
    let waitlistedCount = 0;
    let unpaidCount = 0;
    let notCheckedInCount = 0;

    const roster: AccueilRosterRow[] = session.enrollments.map((e) => {
      if (e.waitlisted) {
        waitlistedCount += 1;
      } else {
        if (e.danceRole === "LEAD") {
          leadsFilled += 1;
          if (e.attended) leadsPresent += 1;
        } else if (e.danceRole === "FOLLOW") {
          followsFilled += 1;
          if (e.attended) followsPresent += 1;
        }
        if (e.attended) presentCount += 1;
        if (!e.paid) unpaidCount += 1;
        if (!e.attended) notCheckedInCount += 1;
      }

      const prog = session.seasonId
        ? progressionByKey.get(`${e.student.id}:${session.course.id}:${session.seasonId}`)
        : undefined;

      return {
        enrollmentId: e.id,
        studentId: e.student.id,
        studentName: e.student.fullName,
        studentEmail: e.student.email,
        danceRole: e.danceRole,
        paid: e.paid,
        waitlisted: e.waitlisted,
        attended: e.attended,
        promotedUnpaid: Boolean(e.promotedAt) && !e.paid && !e.waitlisted,
        pricingTier: e.pricingTier,
        progressionStatus: prog?.status ?? null,
        attendanceLabel: prog ? `${prog.attendedCount}/${prog.expectedWeeks}` : null,
        showEval: !e.waitlisted && !isSocialEvent(session.course.style, session.course.title),
        ticketCode: e.ticketCode,
      };
    });

    // Active seats first; unpaid promoted next; then pending check-in.
    roster.sort((a, b) => {
      if (a.waitlisted !== b.waitlisted) return a.waitlisted ? 1 : -1;
      if (a.promotedUnpaid !== b.promotedUnpaid) return a.promotedUnpaid ? -1 : 1;
      if (a.attended !== b.attended) return a.attended ? 1 : -1;
      return a.studentName.localeCompare(b.studentName, locale);
    });

    const startMin = startHm.h * 60 + startHm.m;
    const endMin = endHm.h * 60 + endHm.m;

    const planWeek = planWeekBySession.get(session.id) ?? 1;
    const lesson = lessonFor(session.course.id, planWeek);

    cards.push({
      sessionId: session.id,
      courseTitle: session.course.title,
      style: session.course.style,
      level: session.course.level,
      roomName: stationLabel(session.room, locale),
      roomColorHex: session.room.colorHex,
      startTime: startIso,
      endTime: endIso,
      startLabel: formatHm(startHm.h, startHm.m),
      endLabel: formatHm(endHm.h, endHm.m),
      instructorName: session.instructor.fullName,
      leads: {
        filled: leadsFilled,
        max: session.maxLeads,
        present: leadsPresent,
      },
      follows: {
        filled: followsFilled,
        max: session.maxFollows,
        present: followsPresent,
      },
      waitlistedCount,
      unpaidCount,
      notCheckedInCount,
      presentCount,
      isSocial: isSocialEvent(session.course.style, session.course.title),
      status: classStatus(nowMin, startMin, endMin),
      roster,
      planWeek,
      tonightPlan: lesson
        ? {
            weekNumber: lesson.weekNumber,
            title: lesson.title,
            body: lesson.body,
            musicNote: lesson.musicNote,
            leadFocus: lesson.leadFocus,
            followFocus: lesson.followFocus,
          }
        : null,
    });
  }

  cards.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const drawer = await loadDrawerSnapshot(membership.locationId, timeZone, now);

  return {
    locationId: membership.location.id,
    locationName: membership.location.name,
    timezone: timeZone,
    date: civil.date,
    generatedAt: now.toISOString(),
    classes: cards,
    drawer,
  };
}
