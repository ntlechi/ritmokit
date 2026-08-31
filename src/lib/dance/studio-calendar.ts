/** Civil-day helpers + occurrence expansion for the studio calendar (no DB). */

const CIVIL_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCivilDate(value: string): boolean {
  return CIVIL_RE.test(value);
}

export function addCivilDays(civil: string, days: number): string {
  const match = CIVIL_RE.exec(civil);
  if (!match) return civil;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weekdayFromCivil(civil: string): number {
  const match = CIVIL_RE.exec(civil);
  if (!match) return 0;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

export function hhmmFromUtcDate(dt: Date): string {
  return `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`;
}

export function maxCivil(a: string, b: string): string {
  return a > b ? a : b;
}

export function minCivil(a: string, b: string): string {
  return a < b ? a : b;
}

export function eachCivilDay(from: string, toExclusive: string): string[] {
  const days: string[] = [];
  if (!isCivilDate(from) || !isCivilDate(toExclusive) || from >= toExclusive) return days;
  for (let cursor = from; cursor < toExclusive; cursor = addCivilDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

export type RecurringClassInput = {
  dayOfWeek: number;
  seasonStartsOn: string | null;
  seasonEndsOn: string | null;
};

/** Recurring weekly class dates clipped to season + requested range. */
export function expandRecurringDates(
  input: RecurringClassInput,
  rangeFrom: string,
  rangeToExclusive: string,
): string[] {
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) return [];
  const from = maxCivil(rangeFrom, input.seasonStartsOn ?? rangeFrom);
  const to = minCivil(
    rangeToExclusive,
    input.seasonEndsOn ? addCivilDays(input.seasonEndsOn, 1) : rangeToExclusive,
  );
  if (from >= to) return [];
  return eachCivilDay(from, to).filter((day) => weekdayFromCivil(day) === input.dayOfWeek);
}

export function oneOffInRange(occurredOn: string, rangeFrom: string, rangeToExclusive: string): boolean {
  return occurredOn >= rangeFrom && occurredOn < rangeToExclusive;
}

export type StudioCalendarKind = "class" | "rental";

export type StudioCalendarEvent = {
  id: string;
  kind: StudioCalendarKind;
  date: string;
  timeStart: string;
  timeEnd: string;
  title: string;
  subtitle: string;
  roomId: string;
  roomName: string;
  onWebsite: boolean;
  status: string;
  href: string;
  booked: number | null;
  attended: number | null;
  capacity: number | null;
  style: string | null;
  isSocial: boolean;
  paymentStatus: string | null;
};

export type StudioCalendarRoom = {
  id: string;
  name: string;
};

export type StudioCalendarSync = {
  liveSeasonName: string | null;
  liveSeasonRange: string | null;
  classesOnWebsite: number;
  draftClasses: number;
  pendingRentals: number;
  confirmedRentals: number;
  locationSlug: string;
  organizationSlug: string;
  rentalModuleEnabled: boolean;
  /** This tenant's public website, if Integrations listed an origin. */
  websiteUrl: string | null;
  /** Tenant-scoped public schedule URL any studio site can fetch. */
  publicScheduleUrl: string;
};

export type StudioCalendarPayload = {
  locationId: string;
  rangeFrom: string;
  rangeToExclusive: string;
  rooms: StudioCalendarRoom[];
  events: StudioCalendarEvent[];
  sync: StudioCalendarSync;
};

export function filterStudioEvents(
  events: StudioCalendarEvent[],
  kind: "all" | StudioCalendarKind,
  roomId: string | null,
): StudioCalendarEvent[] {
  return events.filter((event) => {
    if (kind !== "all" && event.kind !== kind) return false;
    if (roomId && event.roomId !== roomId) return false;
    return true;
  });
}

export function eventsByDate(events: StudioCalendarEvent[]): Map<string, StudioCalendarEvent[]> {
  const map = new Map<string, StudioCalendarEvent[]>();
  for (const event of events) {
    const bucket = map.get(event.date) ?? [];
    bucket.push(event);
    map.set(event.date, bucket);
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.timeStart.localeCompare(b.timeStart) || a.title.localeCompare(b.title));
  }
  return map;
}

export function dayCounts(events: StudioCalendarEvent[]): Map<string, { classes: number; rentals: number }> {
  const map = new Map<string, { classes: number; rentals: number }>();
  for (const event of events) {
    const bucket = map.get(event.date) ?? { classes: 0, rentals: 0 };
    if (event.kind === "class") bucket.classes += 1;
    else bucket.rentals += 1;
    map.set(event.date, bucket);
  }
  return map;
}

export function classIsOnWebsite(
  seasonId: string | null,
  liveSeasonId: string | null,
): boolean {
  if (!liveSeasonId) return false;
  return seasonId === liveSeasonId || seasonId == null;
}
