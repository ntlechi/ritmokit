import "server-only";

export { getTorontoDayBounds } from "@/lib/time/cnesst-week";

type PunchShiftRow = {
  actualStartsAt: Date | null;
  actualEndsAt: Date | null;
  breakStartedAt: Date | null;
  breakEndedAt: Date | null;
  breakMinutes: number;
};

/** Net worked hours from punch timestamps (break deducted). */
export function calculatePunchedWorkedHours(shift: PunchShiftRow): number {
  if (!shift.actualStartsAt || !shift.actualEndsAt) return 0;

  const breakMinutes =
    shift.breakStartedAt && shift.breakEndedAt
      ? Math.round((shift.breakEndedAt.getTime() - shift.breakStartedAt.getTime()) / (60 * 1000))
      : shift.breakMinutes;

  const grossHours =
    (shift.actualEndsAt.getTime() - shift.actualStartsAt.getTime()) / (1000 * 60 * 60);
  return Math.max(grossHours - breakMinutes / 60, 0);
}

/** Parse manager `YYYY-MM-DD` input into a Toronto business date anchor. */
export function parseBusinessDateInput(dateValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
}
