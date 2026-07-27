import { DEFAULT_LOCATION_TIMEZONE } from "@/lib/time/location-timezone";

/**
 * CNESST / LNT week helpers — Sunday 00:00 → next Sunday 00:00 in a store IANA TZ.
 * Single source of truth for weekly-hours / overtime window math (app layer).
 * Postgres `enforce_cnesst_rules` must stay aligned (see migration 0007).
 */

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Day-of-week in `timeZone` — 0 = Sunday … 6 = Saturday. */
export function getDayOfWeekInTimeZone(
  instant: Date,
  timeZone: string = DEFAULT_LOCATION_TIMEZONE,
): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(instant);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

/** Civil day bounds for an already-known Y-M-D in `timeZone` (DST-safe). */
export function getCivilDayBoundsFromYmd(
  year: number,
  month: number,
  day: number,
  timeZone: string = DEFAULT_LOCATION_TIMEZONE,
): { dayStart: Date; dayEnd: Date; distributionDate: Date } {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
  const offsetMs = getTimeZoneOffsetMs(noonUtc, timeZone);
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const distributionDate = new Date(Date.UTC(year, month - 1, day));
  return { dayStart, dayEnd, distributionDate };
}

/**
 * Civil day containing `instant` in `timeZone`.
 * `distributionDate` is a UTC-midnight anchor of that civil Y-M-D (Prisma `@db.Date`).
 */
export function getCivilDayBounds(
  instant: Date,
  timeZone: string = DEFAULT_LOCATION_TIMEZONE,
): { dayStart: Date; dayEnd: Date; distributionDate: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return getCivilDayBoundsFromYmd(year, month, day, timeZone);
}

/** Alias kept for tips/payroll call sites — always America/Toronto. */
export function getTorontoDayBounds(localDate: Date) {
  return getCivilDayBounds(localDate, DEFAULT_LOCATION_TIMEZONE);
}

/**
 * CNESST week containing `instant`: [weekStart, weekEnd) where weekStart is
 * Sunday 00:00 local and weekEnd is the following Sunday 00:00 local.
 */
export function getCnesstWeekBounds(
  instant: Date,
  timeZone: string = DEFAULT_LOCATION_TIMEZONE,
): { weekStart: Date; weekEnd: Date } {
  const dow = getDayOfWeekInTimeZone(instant, timeZone);
  const { distributionDate } = getCivilDayBounds(instant, timeZone);

  const sundayDist = new Date(distributionDate);
  sundayDist.setUTCDate(sundayDist.getUTCDate() - dow);

  const nextSundayDist = new Date(sundayDist);
  nextSundayDist.setUTCDate(nextSundayDist.getUTCDate() + 7);

  const { dayStart: weekStart } = getCivilDayBoundsFromYmd(
    sundayDist.getUTCFullYear(),
    sundayDist.getUTCMonth() + 1,
    sundayDist.getUTCDate(),
    timeZone,
  );
  const { dayStart: weekEnd } = getCivilDayBoundsFromYmd(
    nextSundayDist.getUTCFullYear(),
    nextSundayDist.getUTCMonth() + 1,
    nextSundayDist.getUTCDate(),
    timeZone,
  );

  return { weekStart, weekEnd };
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}
