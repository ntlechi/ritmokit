/**
 * Week start preference — display-only, per browser.
 * The CNESST payroll week stays anchored on Sunday (see lib/finance/labor-kpis);
 * this preference only shifts how the calendar grids are laid out.
 */

export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEK_START_COOKIE = "ritmokit-week-start";
export const LEGACY_WEEK_START_COOKIE = "mirok-week-start";

/** Sunday — matches the CNESST payroll week. */
export const DEFAULT_WEEK_START: WeekStartDay = 0;

export function parseWeekStart(value: string | null | undefined): WeekStartDay {
  if (!value) return DEFAULT_WEEK_START;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
    return parsed as WeekStartDay;
  }
  return DEFAULT_WEEK_START;
}

/** Reads ritmokit-week-start with fallback to legacy mirok-week-start. */
export function readWeekStartCookie(
  primary: string | null | undefined,
  legacy: string | null | undefined,
): WeekStartDay {
  return parseWeekStart(primary ?? legacy);
}
