import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Default civil timezone for Toronto-first ops.
 * Prefer `resolveLocationTimeZone(locationId)` when a location is known.
 */
export const DEFAULT_LOCATION_TIMEZONE = "America/Toronto";

const tzMemo = new Map<string, string>();

/**
 * Sync seam for civil-day math when the caller already resolved TZ, or as a
 * Toronto fallback. Prefer `resolveLocationTimeZone` on async server paths.
 */
export function locationTimeZone(locationId: string): string {
  return tzMemo.get(locationId) ?? DEFAULT_LOCATION_TIMEZONE;
}

/** Read `Location.timezone` (cached per request + process memo). */
export const resolveLocationTimeZone = cache(async (locationId: string): Promise<string> => {
  const hit = tzMemo.get(locationId);
  if (hit) return hit;

  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    select: { timezone: true },
  });
  const tz = loc?.timezone?.trim() || DEFAULT_LOCATION_TIMEZONE;
  tzMemo.set(locationId, tz);
  return tz;
});

/** Format an instant as a civil YYYY-MM-DD string in the given IANA timezone. */
export function civilDateString(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Signed civil-day delta (to − from) in the store's timezone — DST-safe. */
export function civilDaysDelta(from: Date, to: Date, timeZone: string): number {
  const a = civilDateString(from, timeZone);
  const b = civilDateString(to, timeZone);
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aUtc = Date.UTC(ay!, am! - 1, ad!);
  const bUtc = Date.UTC(by!, bm! - 1, bd!);
  return Math.floor((bUtc - aUtc) / 86_400_000);
}

/**
 * Whole civil-day difference (floor, never negative) between two instants
 * in the store's timezone — immune to DST 23/25h drift.
 */
export function civilDaysBetween(anchor: Date, now: Date, timeZone: string): number {
  return Math.max(0, civilDaysDelta(anchor, now, timeZone));
}

/** Parse YYYY-MM-DD into a UTC date suitable for Prisma `@db.Date`. */
export function civilDateToUtcDate(civil: string): Date {
  const [y, m, d] = civil.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Add whole civil days to a YYYY-MM-DD string (calendar arithmetic, not ms). */
export function addCivilDays(civil: string, days: number): string {
  const base = civilDateToUtcDate(civil);
  base.setUTCDate(base.getUTCDate() + days);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
