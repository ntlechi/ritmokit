import { format, subDays } from "date-fns";
import { enUS, es, fr } from "date-fns/locale";
import type { Locale } from "@/lib/i18n/config";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

export function formatTimeRange(start: Date, end: Date, locale: Locale = "fr") {
  const opts = { locale: dateFnsLocales[locale] };
  return `${format(start, "HH:mm", opts)}–${format(end, "HH:mm", opts)}`;
}

export function formatDayLabel(date: Date, locale: Locale = "fr") {
  return format(date, "EEEE d MMMM", { locale: dateFnsLocales[locale] });
}

export function formatMonthLabel(date: Date, locale: Locale = "fr") {
  return format(date, "MMMM yyyy", { locale: dateFnsLocales[locale] });
}

/**
 * `end` is the exclusive week boundary (`start` + 7 days, per `getWeekRange`),
 * so the label shows the last actual day of the week (`end` minus one day) —
 * otherwise the range reads one day too long and spills into the next week.
 */
export function formatWeekRangeLabel(start: Date, end: Date, locale: Locale = "fr") {
  const opts = { locale: dateFnsLocales[locale] };
  const lastDay = subDays(end, 1);
  return `${format(start, "d MMM", opts)} – ${format(lastDay, "d MMM yyyy", opts)}`;
}

export function formatQuarterLabel(anchor: Date, locale: Locale = "fr") {
  const quarter = Math.floor(anchor.getMonth() / 3) + 1;
  const prefix = locale === "en" ? "Q" : "T";
  return `${prefix}${quarter} ${anchor.getFullYear()}`;
}

export function formatYearLabel(anchor: Date) {
  return String(anchor.getFullYear());
}

export function shiftDurationHours(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}
