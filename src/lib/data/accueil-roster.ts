import "server-only";

import { prisma } from "@/lib/prisma";
import { findTonightLesson, seasonWeekNumber } from "@/lib/data/course-lessons";
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

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    select: {
      locationId: true,
      location: { select: { id: true, name: true, timezone: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  const timeZone = membership.location.timezone || "America/Toronto";
  const civil = civilInTimeZone(now, timeZone);
  const nowMin = civil.hour * 60 + civil.minute;

  await ensureStudioOsSchema();
  const progressions = await prisma.studentProgression.findMany({
    where: { locationId: membership.locationId },
    select: {
      studentId: true,
      courseId: true,
      seasonId: true,
      status: true,
      attendedCount: true,
      expectedWeeks: true,
    },
  });
  const progressionByKey = new Map(
    progressions.map((p) => [`${p.studentId}:${p.courseId}:${p.seasonId}`, p]),
  );

  const sessions = await prisma.classSession.findMany({
    where: {
      OR: [
        { season: { locationId: membership.locationId, status: "ACTIVE" } },
        { room: { locationId: membership.locationId }, seasonId: null },
      ],
    },
    include: {
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
        include: {
          student: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ waitlisted: "asc" }, { createdAt: "asc" }],
        // promotedAt used for Accueil unpaid priority (agent chase).
      },
    },
  });

  const cards: AccueilClassCard[] = [];

  for (const session of sessions) {
    if (session.room.locationId !== membership.locationId) continue;

    const startHm = hmUtc(session.startTime);
    const endHm = hmUtc(session.endTime);

    let include = false;
    if (session.dayOfWeek != null) {
      include = session.dayOfWeek === civil.dow;
    } else {
      const startCivil = civilInTimeZone(session.startTime, timeZone);
      include = startCivil.date === civil.date;
    }
    if (!include) continue;

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

    const planWeek = session.season?.startsOn
      ? seasonWeekNumber(session.season.startsOn, new Date(`${civil.date}T12:00:00`))
      : 1;
    const lesson = await findTonightLesson(session.course.id, planWeek);

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

  return {
    locationId: membership.location.id,
    locationName: membership.location.name,
    timezone: timeZone,
    date: civil.date,
    generatedAt: now.toISOString(),
    classes: cards,
  };
}
