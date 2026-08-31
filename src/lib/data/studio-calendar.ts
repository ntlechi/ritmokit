import "server-only";

import { format } from "date-fns";
import { isSocialEvent } from "@/lib/dance/door-search";
import {
  classIsOnWebsite,
  expandRecurringDates,
  hhmmFromUtcDate,
  oneOffInRange,
  type StudioCalendarEvent,
  type StudioCalendarPayload,
} from "@/lib/dance/studio-calendar";
import { prisma } from "@/lib/prisma";
import { getPrimaryMembership } from "@/lib/auth/session";
import { stationLabel } from "@/lib/stations/display";
import { civilDateFromDbDate } from "@/lib/rentals/wall-time";
import { resolvePublicBookingBaseUrl } from "@/lib/public-api/booking-return";
import { civilDateToUtcDate } from "@/lib/time/location-timezone";
import type { Locale } from "@/lib/i18n/config";

function toCivil(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildPublicScheduleUrl(organizationSlug: string, locationSlug: string): string {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (organizationSlug) params.set("organizationSlug", organizationSlug);
  if (locationSlug) params.set("locationSlug", locationSlug);
  const query = params.toString();
  return `${app || ""}/api/public/schedule${query ? `?${query}` : ""}`;
}

export async function getStudioCalendarForUser(
  userId: string,
  locale: Locale,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<StudioCalendarPayload | null> {
  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const locationId = membership.locationId;
  const rangeFrom = format(rangeStart, "yyyy-MM-dd");
  const rangeToExclusive = format(rangeEnd, "yyyy-MM-dd");

  const [location, seasons, classRows, rooms, rentals, attendance, rentalSettings, pendingAll, websiteUrl] =
    await Promise.all([
    prisma.location.findUnique({
      where: { id: locationId },
      select: { slug: true, organization: { select: { slug: true } } },
    }),
    prisma.sessionSeason.findMany({
      where: { locationId },
      select: {
        id: true,
        name: true,
        status: true,
        bookingOpen: true,
        startsOn: true,
        endsOn: true,
      },
    }),
    prisma.classSession.findMany({
      where: {
        OR: [{ season: { locationId } }, { room: { locationId } }],
      },
      include: {
        course: { select: { title: true, style: true, level: true } },
        room: true,
        instructor: { select: { fullName: true } },
        season: { select: { id: true, status: true, startsOn: true, endsOn: true } },
        enrollments: { select: { waitlisted: true } },
      },
    }),
    prisma.station.findMany({
      where: { locationId, kind: "ROOM", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
    prisma.rentalBooking.findMany({
      where: {
        locationId,
        status: { not: "CANCELLED" },
        date: {
          gte: civilDateToUtcDate(rangeFrom),
          lt: civilDateToUtcDate(rangeToExclusive),
        },
      },
      include: { room: true },
      orderBy: [{ date: "asc" }, { timeStart: "asc" }],
    }),
    prisma.classAttendance.findMany({
      where: {
        attended: true,
        occurredOn: {
          gte: civilDateToUtcDate(rangeFrom),
          lt: civilDateToUtcDate(rangeToExclusive),
        },
        enrollment: { session: { room: { locationId } } },
      },
      select: {
        occurredOn: true,
        enrollment: { select: { sessionId: true } },
      },
    }),
    prisma.locationRentalSettings.findUnique({
      where: { locationId },
      select: { moduleEnabled: true },
    }),
    prisma.rentalBooking.count({
      where: { locationId, status: "PENDING" },
    }),
    resolvePublicBookingBaseUrl(locationId),
  ]);

  const liveSeason =
    seasons
      .filter((s) => s.status === "ACTIVE" && s.bookingOpen)
      .sort((a, b) => b.startsOn.getTime() - a.startsOn.getTime())[0] ?? null;

  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  const attendedByKey = new Map<string, number>();
  for (const row of attendance) {
    const key = `${row.enrollment.sessionId}:${civilDateFromDbDate(row.occurredOn)}`;
    attendedByKey.set(key, (attendedByKey.get(key) ?? 0) + 1);
  }

  const events: StudioCalendarEvent[] = [];
  let classesOnWebsite = 0;
  let draftClasses = 0;

  for (const row of classRows) {
    const season = row.seasonId ? seasonById.get(row.seasonId) ?? row.season : null;
    const seasonStartsOn = season ? toCivil(season.startsOn) : null;
    const seasonEndsOn = season ? toCivil(season.endsOn) : null;
    const onWebsite = classIsOnWebsite(row.seasonId, liveSeason?.id ?? null);
    if (onWebsite) classesOnWebsite += 1;
    else draftClasses += 1;

    const booked = row.enrollments.filter((e) => !e.waitlisted).length;
    const capacity = row.maxLeads + row.maxFollows;
    const title = row.course.title;
    const isSocial = isSocialEvent(row.course.style, title);
    const timeStart = hhmmFromUtcDate(row.startTime);
    const timeEnd = hhmmFromUtcDate(row.endTime);
    const roomName = stationLabel(row.room, locale);
    const href = `/${locale}/sessions`;

    const dates =
      row.dayOfWeek == null
        ? oneOffInRange(toCivil(row.startTime), rangeFrom, rangeToExclusive)
          ? [toCivil(row.startTime)]
          : []
        : expandRecurringDates(
            { dayOfWeek: row.dayOfWeek, seasonStartsOn, seasonEndsOn },
            rangeFrom,
            rangeToExclusive,
          );

    for (const date of dates) {
      events.push({
        id: `class:${row.id}:${date}`,
        kind: "class",
        date,
        timeStart,
        timeEnd,
        title,
        subtitle: row.instructor.fullName,
        roomId: row.roomId,
        roomName,
        onWebsite,
        status: season?.status ?? "ACTIVE",
        href,
        booked,
        attended: attendedByKey.get(`${row.id}:${date}`) ?? 0,
        capacity,
        style: row.course.style,
        isSocial,
        paymentStatus: null,
      });
    }
  }

  const rentalModuleEnabled = rentalSettings?.moduleEnabled ?? false;
  let confirmedRentals = 0;

  for (const row of rentals) {
    if (row.status === "CONFIRMED") confirmedRentals += 1;
    events.push({
      id: `rental:${row.id}`,
      kind: "rental",
      date: civilDateFromDbDate(row.date),
      timeStart: row.timeStart,
      timeEnd: row.timeEnd,
      title: row.clientOrg?.trim() || row.clientName,
      subtitle: row.type === "STAFF" ? "staff" : row.type.toLowerCase(),
      roomId: row.roomId,
      roomName: stationLabel(row.room, locale),
      onWebsite: rentalModuleEnabled && row.status !== "CANCELLED",
      status: row.status,
      href: `/${locale}/rentals`,
      booked: null,
      attended: null,
      capacity: null,
      style: null,
      isSocial: false,
      paymentStatus: row.paymentStatus,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.timeStart.localeCompare(b.timeStart));

  return {
    locationId,
    rangeFrom,
    rangeToExclusive,
    rooms: rooms.map((room) => ({ id: room.id, name: stationLabel(room, locale) })),
    events,
    sync: {
      liveSeasonName: liveSeason?.name ?? null,
      liveSeasonRange: liveSeason
        ? `${toCivil(liveSeason.startsOn)} → ${toCivil(liveSeason.endsOn)}`
        : null,
      classesOnWebsite,
      draftClasses,
      pendingRentals: pendingAll,
      confirmedRentals,
      locationSlug: location?.slug ?? "",
      organizationSlug: location?.organization.slug ?? "",
      rentalModuleEnabled,
      websiteUrl,
      publicScheduleUrl: buildPublicScheduleUrl(
        location?.organization.slug ?? "",
        location?.slug ?? "",
      ),
    },
  };
}
