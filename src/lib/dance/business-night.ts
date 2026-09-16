/** Pure business-night math (no DB) shared by the drawer close and its tests. */

/** A studio night runs past midnight; the business day rolls over at 06:00 local. */
export const BUSINESS_DAY_ROLLOVER_HOUR = 6;

function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * [start, end) instants for the business night containing `now`, plus the
 * civil date it belongs to. 01:30 Saturday still belongs to Friday's night.
 */
export function businessNightWindow(now: Date, timeZone: string) {
  const offsetMin = tzOffsetMinutes(now, timeZone);
  const localMs = now.getTime() + offsetMin * 60_000;
  const rolled = new Date(localMs - BUSINESS_DAY_ROLLOVER_HOUR * 3_600_000);
  const y = rolled.getUTCFullYear();
  const m = rolled.getUTCMonth();
  const d = rolled.getUTCDate();
  const startLocal = Date.UTC(y, m, d, BUSINESS_DAY_ROLLOVER_HOUR);
  const start = new Date(startLocal - offsetMin * 60_000);
  const end = new Date(start.getTime() + 24 * 3_600_000);
  const businessDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { start, end, businessDate, businessDateUtc: new Date(Date.UTC(y, m, d)) };
}
