import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { DEFAULT_WEEK_START, type WeekStartDay } from "@/lib/calendar/week-start";

export function getMonthGridDays(anchor: Date, weekStartsOn: WeekStartDay = DEFAULT_WEEK_START): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn });
  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export function getWeekDays(anchor: Date, weekStartsOn: WeekStartDay = DEFAULT_WEEK_START): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getWeekRange(
  anchor: Date,
  weekStartsOn: WeekStartDay = DEFAULT_WEEK_START,
): { start: Date; end: Date } {
  const start = startOfWeek(anchor, { weekStartsOn });
  return { start, end: addDays(start, 7) };
}

export function getMonthRange(
  anchor: Date,
  weekStartsOn: WeekStartDay = DEFAULT_WEEK_START,
): { start: Date; end: Date } {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn });
  const end = addDays(startOfWeek(endOfMonth(anchor), { weekStartsOn }), 7);
  return { start, end };
}

export function getDayRange(anchor: Date): { start: Date; end: Date } {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 1);
  return { start, end };
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a `?date=yyyy-MM-dd` param — the format `PeriodNav` writes via
 * `format(date, "yyyy-MM-dd")` (client's local calendar day).
 *
 * `new Date("yyyy-MM-dd")` would parse this as UTC midnight per the ES spec,
 * which silently rolls back to the previous local day everywhere east of
 * Greenwich once the server's clock isn't UTC-aligned with the visitor's —
 * exactly the "week starts a day early" symptom. Building the date from its
 * year/month/day components instead keeps it anchored to local midnight,
 * matching how it was generated.
 */
export function parseDateParam(value: string | undefined): Date {
  if (!value) return new Date();
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
