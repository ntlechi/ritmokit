/**
 * Room rental availability engine — ported from Salsa Attitude `rentalSchedule.js`.
 * Pure functions (no DB). Classes block exact windows; buffer applies after rentals only.
 */

export type OccupancySource = "class" | "booking";

export type OccupancyBlock = {
  roomId: string;
  start: string;
  end: string;
  source: OccupancySource;
  label: string;
  bookingType?: "prive" | "b2b" | "staff";
  status?: string;
};

export type ClassOccupancyInput = {
  roomId: string;
  dayOfWeek: number | null;
  /** HH:mm wall clock */
  timeStart: string;
  timeEnd: string;
  label: string;
  /** Civil YYYY-MM-DD for one-off classes */
  dateIso?: string | null;
  /** Inclusive civil season bounds for weekly classes; null = unbounded. */
  validFrom?: string | null;
  validTo?: string | null;
};

export type BookingOccupancyInput = {
  roomId: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  type?: "prive" | "b2b" | "staff";
  status: string;
};

export type RentalSlot = { start: string; end: string; priceCents?: number };

export type DayAvailabilityStatus = "past" | "open" | "mixed" | "full";

const DAY_NAMES_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;

export function dateToSessionDay(dateIso: string): (typeof DAY_NAMES_FR)[number] | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return DAY_NAMES_FR[d.getDay()] ?? null;
}

export function dateToDayOfWeek(dateIso: string): number | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

export function parseMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addMinutesToTime(hhmm: string, delta: number): string | null {
  const base = parseMinutes(hhmm);
  if (base == null) return null;
  return formatMinutes(base + delta);
}

/** Half-open overlap [start, end) in minutes. */
export function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

export function bookingPublicLabel(booking: {
  type?: string | null;
  clientName?: string | null;
}): string {
  if (booking?.type === "staff") return `Prof · ${booking.clientName || "Équipe"}`;
  if (booking?.type === "b2b") return "Réservation B2B";
  return "Réservation privée";
}

export function getClassOccupancyBlocks(
  classes: ClassOccupancyInput[],
  dateIso: string,
): OccupancyBlock[] {
  const dow = dateToDayOfWeek(dateIso);
  if (dow == null) return [];

  return classes
    .filter((c) => {
      if (!c.timeStart || !c.timeEnd || !c.roomId) return false;
      if (c.dayOfWeek == null) return c.dateIso === dateIso;
      if (c.dayOfWeek !== dow) return false;
      if (c.validFrom && dateIso < c.validFrom) return false;
      if (c.validTo && dateIso > c.validTo) return false;
      return true;
    })
    .map((c) => ({
      roomId: c.roomId,
      start: c.timeStart,
      end: c.timeEnd,
      source: "class" as const,
      label: c.label,
    }));
}

const RELEASED_STATUSES = new Set(["cancelled", "expired"]);

export function getBookingBlocks(
  bookings: BookingOccupancyInput[],
  roomId: string,
  dateIso: string,
): OccupancyBlock[] {
  return bookings
    .filter(
      (b) =>
        b.roomId === roomId &&
        b.date === dateIso &&
        !RELEASED_STATUSES.has(b.status.toLowerCase()),
    )
    .map((b) => ({
      roomId: b.roomId,
      start: b.timeStart,
      end: b.timeEnd,
      source: "booking" as const,
      bookingType: b.type || "prive",
      label: bookingPublicLabel({ type: b.type, clientName: undefined }),
      status: b.status,
    }));
}

export function isSlotAvailable(input: {
  classes: ClassOccupancyInput[];
  bookings: BookingOccupancyInput[];
  roomId: string;
  dateIso: string;
  timeStart: string;
  timeEnd: string;
  bufferMinutes?: number;
}): { ok: true } | { ok: false; reason: string } {
  const startMin = parseMinutes(input.timeStart);
  const endMin = parseMinutes(input.timeEnd);
  if (startMin == null || endMin == null || endMin <= startMin) {
    return { ok: false, reason: "Horaire invalide" };
  }

  const bufferMinutes = input.bufferMinutes ?? 15;
  const blocks = [
    ...getClassOccupancyBlocks(input.classes, input.dateIso),
    ...getBookingBlocks(input.bookings, input.roomId, input.dateIso),
  ].filter((b) => b.roomId === input.roomId);

  // Buffer follows every rental (cleanup / changeover) — including the one being
  // requested — but never follows a class.
  const requestedEnd = endMin + bufferMinutes;
  for (const block of blocks) {
    const bStart = parseMinutes(block.start);
    const bEndRaw = parseMinutes(block.end);
    if (bStart == null || bEndRaw == null) continue;
    const bEnd = bEndRaw + (block.source === "booking" ? bufferMinutes : 0);
    if (rangesOverlap(startMin, requestedEnd, bStart, bEnd)) {
      return {
        ok: false,
        reason:
          block.source === "class"
            ? `Cours « ${block.label} » (${block.start}–${block.end})`
            : `Créneau déjà réservé (${block.start}–${block.end})`,
      };
    }
  }

  return { ok: true };
}

export type RentalForClassCheck = {
  date: string;
  timeStart: string;
  timeEnd: string;
  clientName: string;
};

/**
 * The inverse of `isSlotAvailable`: rentals a class would land on. A weekly
 * class hits every matching weekday between `validFrom` and `validTo`; a
 * one-off only its own date. The rental's changeover buffer counts, so a class
 * can't start while the previous renter is still clearing out.
 */
export function findRentalConflictsForClass(input: {
  rentals: RentalForClassCheck[];
  dayOfWeek: number | null;
  dateIso?: string | null;
  timeStart: string;
  timeEnd: string;
  validFrom: string;
  validTo?: string | null;
  bufferMinutes?: number;
}): RentalForClassCheck[] {
  const start = parseMinutes(input.timeStart);
  const end = parseMinutes(input.timeEnd);
  if (start == null || end == null) return [];
  const bufferMinutes = input.bufferMinutes ?? 15;

  return input.rentals.filter((r) => {
    if (input.dayOfWeek == null) {
      if (r.date !== input.dateIso) return false;
    } else {
      if (dateToDayOfWeek(r.date) !== input.dayOfWeek) return false;
      if (r.date < input.validFrom) return false;
      if (input.validTo && r.date > input.validTo) return false;
    }
    const rStart = parseMinutes(r.timeStart);
    const rEnd = parseMinutes(r.timeEnd);
    if (rStart == null || rEnd == null) return false;
    return rangesOverlap(start, end, rStart, rEnd + bufferMinutes);
  });
}

export function getAvailableStartTimes(input: {
  classes: ClassOccupancyInput[];
  bookings: BookingOccupancyInput[];
  roomId: string;
  dateIso: string;
  durationMinutes: number;
  openHour?: number;
  closeHour?: number;
  bufferMinutes?: number;
}): RentalSlot[] {
  const openHour = input.openHour ?? 8;
  const closeHour = input.closeHour ?? 23;
  const bufferMinutes = input.bufferMinutes ?? 15;
  const slots: RentalSlot[] = [];

  for (let hour = openHour; hour < closeHour; hour += 1) {
    for (const minute of [0, 30]) {
      const start = formatMinutes(hour * 60 + minute);
      const end = addMinutesToTime(start, input.durationMinutes);
      if (!end || (parseMinutes(end) ?? 0) > closeHour * 60) continue;
      const check = isSlotAvailable({
        classes: input.classes,
        bookings: input.bookings,
        roomId: input.roomId,
        dateIso: input.dateIso,
        timeStart: start,
        timeEnd: end,
        bufferMinutes,
      });
      if (check.ok) slots.push({ start, end });
    }
  }
  return slots;
}

export function estimateRentalPriceCents(
  hourlyRateCents: number,
  durationMinutes: number,
): number {
  return Math.round((hourlyRateCents * durationMinutes) / 60);
}

export type RentalWindowError = "invalid_time_range" | "outside_hours" | "invalid_duration";

/**
 * Shape rules for a requested window. Public bookings must sit inside opening
 * hours on the 30-min grid with an offered duration; staff may book any window.
 */
export function validateRentalWindow(input: {
  timeStart: string;
  timeEnd: string;
  openHour: number;
  closeHour: number;
  durationOptions?: number[] | null;
  mode: "public" | "staff";
}): RentalWindowError | null {
  const start = parseMinutes(input.timeStart);
  const end = parseMinutes(input.timeEnd);
  if (start == null || end == null || end <= start || end > 24 * 60) return "invalid_time_range";
  if (input.mode === "staff") return null;
  if (start < input.openHour * 60 || end > input.closeHour * 60) return "outside_hours";
  if (start % 30 !== 0) return "invalid_time_range";
  const options = input.durationOptions?.filter((m) => m > 0) ?? [];
  if (options.length > 0 && !options.includes(end - start)) return "invalid_duration";
  return null;
}

export function getRoomDayOccupancy(input: {
  classes: ClassOccupancyInput[];
  bookings: BookingOccupancyInput[];
  roomId: string;
  dateIso: string;
  bufferMinutes?: number;
}) {
  const bufferMinutes = input.bufferMinutes ?? 15;
  const classes = getClassOccupancyBlocks(input.classes, input.dateIso)
    .filter((b) => b.roomId === input.roomId)
    .map((b) => ({ ...b, type: "class" as const }));
  const rentals = getBookingBlocks(input.bookings, input.roomId, input.dateIso).map((b) => ({
    ...b,
    type: "booking" as const,
    endBuffered: addMinutesToTime(b.end, bufferMinutes),
  }));
  return {
    sessionDay: dateToSessionDay(input.dateIso),
    classes,
    rentals,
    all: [...classes, ...rentals].sort(
      (a, b) => (parseMinutes(a.start) ?? 0) - (parseMinutes(b.start) ?? 0),
    ),
  };
}

export function buildRoomDayTimeline(input: {
  classes: ClassOccupancyInput[];
  bookings: BookingOccupancyInput[];
  roomId: string;
  dateIso: string;
  openHour?: number;
  closeHour?: number;
  bufferMinutes?: number;
}) {
  const openHour = input.openHour ?? 8;
  const closeHour = input.closeHour ?? 23;
  const bufferMinutes = input.bufferMinutes ?? 15;

  const occupied = [
    ...getClassOccupancyBlocks(input.classes, input.dateIso).filter(
      (b) => b.roomId === input.roomId,
    ),
    ...getBookingBlocks(input.bookings, input.roomId, input.dateIso),
  ]
    .map((b) => ({
      type: b.source === "class" ? "class" : b.bookingType || "booking",
      start: b.start,
      end: b.end,
      label: b.label,
      startMin: parseMinutes(b.start)!,
      endMin: (parseMinutes(b.end) ?? 0) + (b.source === "booking" ? bufferMinutes : 0),
    }))
    .filter((b) => b.startMin != null && b.endMin != null)
    .sort((a, b) => a.startMin - b.startMin);

  const dayStart = openHour * 60;
  const dayEnd = closeHour * 60;
  const total = dayEnd - dayStart;
  const segments: Array<{
    type: string;
    start: string;
    end: string;
    label: string;
    startMin: number;
    endMin: number;
    leftPct: number;
    widthPct: number;
  }> = [];
  let cursor = dayStart;

  for (const block of occupied) {
    const blockStart = Math.max(block.startMin, dayStart);
    const blockEnd = Math.min(block.endMin, dayEnd);
    if (blockEnd <= dayStart || blockStart >= dayEnd) continue;

    if (blockStart > cursor) {
      segments.push({
        type: "available",
        start: formatMinutes(cursor),
        end: formatMinutes(blockStart),
        label: "Disponible",
        startMin: cursor,
        endMin: blockStart,
        leftPct: 0,
        widthPct: 0,
      });
    }
    segments.push({
      type: block.type,
      start: block.start,
      end: block.end,
      label: block.label,
      startMin: blockStart,
      endMin: blockEnd,
      leftPct: 0,
      widthPct: 0,
    });
    cursor = Math.max(cursor, blockEnd);
  }

  if (cursor < dayEnd) {
    segments.push({
      type: "available",
      start: formatMinutes(cursor),
      end: formatMinutes(dayEnd),
      label: "Disponible",
      startMin: cursor,
      endMin: dayEnd,
      leftPct: 0,
      widthPct: 0,
    });
  }

  const withLayout = segments.map((seg) => ({
    ...seg,
    leftPct: total > 0 ? ((seg.startMin - dayStart) / total) * 100 : 0,
    widthPct: total > 0 ? ((seg.endMin - seg.startMin) / total) * 100 : 0,
  }));

  return {
    sessionDay: dateToSessionDay(input.dateIso),
    openHour,
    closeHour,
    segments: withLayout,
    occupied,
  };
}

export function todayIsoInTimeZone(timeZone = "America/Toronto", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getDayAvailabilitySummary(input: {
  classes: ClassOccupancyInput[];
  bookings: BookingOccupancyInput[];
  roomId: string;
  dateIso: string;
  durationMinutes?: number;
  openHour?: number;
  closeHour?: number;
  bufferMinutes?: number;
  todayIso?: string;
  /** Starts sooner than this notice can't be booked, so they don't count as free. */
  minLeadHours?: number;
  timeZone?: string;
  now?: Date;
}): {
  dateIso: string;
  sessionDay: string | null;
  status: DayAvailabilityStatus;
  slotsAvailable: number;
  classCount: number;
  rentalCount: number;
  byType: { prive: number; b2b: number; staff: number };
  hasSchoolClasses: boolean;
} {
  const durationMinutes = input.durationMinutes ?? 60;
  const today = input.todayIso ?? todayIsoInTimeZone();
  const occupancy = getRoomDayOccupancy({
    classes: input.classes,
    bookings: input.bookings,
    roomId: input.roomId,
    dateIso: input.dateIso,
    bufferMinutes: input.bufferMinutes,
  });

  const past = input.dateIso < today;
  const openSlots = past
    ? []
    : getAvailableStartTimes({
        classes: input.classes,
        bookings: input.bookings,
        roomId: input.roomId,
        dateIso: input.dateIso,
        durationMinutes,
        openHour: input.openHour,
        closeHour: input.closeHour,
        bufferMinutes: input.bufferMinutes,
      });
  const slots =
    input.minLeadHours != null && openSlots.length > 0
      ? filterByMinLead(openSlots, {
          dateIso: input.dateIso,
          minLeadHours: input.minLeadHours,
          timeZone: input.timeZone,
          now: input.now,
        })
      : openSlots;
  // Free slots that only fail the notice rule mean "too late to book", not "full".
  const tooLate = openSlots.length > 0 && slots.length === 0;

  const byType = { prive: 0, b2b: 0, staff: 0 };
  for (const rental of occupancy.rentals) {
    const key = rental.bookingType || "prive";
    if (key in byType) byType[key] += 1;
    else byType.prive += 1;
  }

  let status: DayAvailabilityStatus = "open";
  if (past || tooLate) status = "past";
  else if (slots.length === 0) status = "full";
  else if (occupancy.all.length > 0) status = "mixed";

  return {
    dateIso: input.dateIso,
    sessionDay: occupancy.sessionDay,
    status,
    slotsAvailable: slots.length,
    classCount: occupancy.classes.length,
    rentalCount: occupancy.rentals.length,
    byType,
    hasSchoolClasses: occupancy.classes.length > 0,
  };
}

function filterByMinLead(
  slots: RentalSlot[],
  input: { dateIso: string; minLeadHours: number; timeZone?: string; now?: Date },
): RentalSlot[] {
  const now = input.now ?? new Date();
  const earliest = new Date(now.getTime() + Math.max(0, input.minLeadHours) * HOUR_MS);
  // Days past the notice horizon are never affected; skip the per-slot TZ math.
  if (input.dateIso > todayIsoInTimeZone(input.timeZone, earliest)) return slots;
  return slots.filter(
    (s) =>
      !violatesMinLead({
        dateIso: input.dateIso,
        timeStart: s.start,
        minLeadHours: input.minLeadHours,
        timeZone: input.timeZone,
        now,
      }),
  );
}

export function getMonthAvailability(input: {
  classes: ClassOccupancyInput[];
  bookings: BookingOccupancyInput[];
  roomId: string;
  year: number;
  month: number;
  durationMinutes?: number;
  openHour?: number;
  closeHour?: number;
  bufferMinutes?: number;
  todayIso?: string;
  minLeadHours?: number;
  timeZone?: string;
  now?: Date;
}) {
  const first = new Date(input.year, input.month, 1);
  const daysInMonth = new Date(input.year, input.month + 1, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells: Array<Record<string, unknown>> = [];

  for (let i = 0; i < mondayOffset; i += 1) {
    cells.push({ kind: "pad", key: `pad-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateIso = `${input.year}-${String(input.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const daySummary = getDayAvailabilitySummary({
      classes: input.classes,
      bookings: input.bookings,
      roomId: input.roomId,
      dateIso,
      durationMinutes: input.durationMinutes,
      openHour: input.openHour,
      closeHour: input.closeHour,
      bufferMinutes: input.bufferMinutes,
      todayIso: input.todayIso,
      minLeadHours: input.minLeadHours,
      timeZone: input.timeZone,
      now: input.now,
    });
    cells.push({
      kind: "day",
      key: dateIso,
      day,
      ...daySummary,
    });
  }

  return {
    year: input.year,
    month: input.month,
    label: first.toLocaleDateString("fr-CA", { month: "long", year: "numeric" }),
    cells,
  };
}

const HOUR_MS = 60 * 60 * 1000;

/** The real instant of a civil date + HH:mm wall clock in `timeZone`. */
export function civilStartInstant(
  dateIso: string,
  timeStart: string,
  timeZone = "America/Toronto",
): Date {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const [hh, mm] = timeStart.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(utcGuess).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return new Date(utcGuess.getTime() - (asLocal - utcGuess.getTime()));
}

/** True when public booking start is sooner than minLeadHours from now (a past start always violates). */
export function violatesMinLead(input: {
  dateIso: string;
  timeStart: string;
  minLeadHours: number;
  timeZone?: string;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const startInstant = civilStartInstant(input.dateIso, input.timeStart, input.timeZone);
  const leadMs = Math.max(0, input.minLeadHours) * HOUR_MS;
  return startInstant.getTime() - now.getTime() < leadMs;
}

export const RENTAL_HOLD_HOURS = 24;
export const RENTAL_HOLD_CUTOFF_HOURS = 2;

/**
 * When an unpaid online hold stops blocking the room: 24 h after booking or
 * 2 h before the start, whichever comes first. A booking made inside that
 * 2 h window keeps its hold until the start — there's no time left to resell it.
 */
export function computeRentalHoldExpiry(input: {
  dateIso: string;
  timeStart: string;
  timeZone?: string;
  now?: Date;
}): Date {
  const now = input.now ?? new Date();
  const start = civilStartInstant(input.dateIso, input.timeStart, input.timeZone).getTime();
  const expiry = Math.min(
    now.getTime() + RENTAL_HOLD_HOURS * HOUR_MS,
    start - RENTAL_HOLD_CUTOFF_HOURS * HOUR_MS,
  );
  return new Date(expiry > now.getTime() ? expiry : start);
}
