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
      if (c.dayOfWeek != null) return c.dayOfWeek === dow;
      return c.dateIso === dateIso;
    })
    .map((c) => ({
      roomId: c.roomId,
      start: c.timeStart,
      end: c.timeEnd,
      source: "class" as const,
      label: c.label,
    }));
}

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
        b.status !== "cancelled" &&
        b.status !== "CANCELLED",
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

  for (const block of blocks) {
    const bStart = parseMinutes(block.start);
    const bEndRaw = parseMinutes(block.end);
    if (bStart == null || bEndRaw == null) continue;
    // Buffer ONLY after bookings — NOT after classes.
    const bEnd = bEndRaw + (block.source === "booking" ? bufferMinutes : 0);
    if (rangesOverlap(startMin, endMin, bStart, bEnd)) {
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
  const slots = past
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

  const byType = { prive: 0, b2b: 0, staff: 0 };
  for (const rental of occupancy.rentals) {
    const key = rental.bookingType || "prive";
    if (key in byType) byType[key] += 1;
    else byType.prive += 1;
  }

  let status: DayAvailabilityStatus = "open";
  if (past) status = "past";
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

/** True when public booking start is sooner than minLeadHours from now. */
export function violatesMinLead(input: {
  dateIso: string;
  timeStart: string;
  minLeadHours: number;
  timeZone?: string;
  now?: Date;
}): boolean {
  if (input.minLeadHours <= 0) return false;
  const now = input.now ?? new Date();
  const timeZone = input.timeZone ?? "America/Toronto";
  // Build an approximate instant: civil date + HH:mm interpreted in location TZ via offset probe.
  const [y, mo, d] = input.dateIso.split("-").map(Number);
  const [hh, mm] = input.timeStart.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
  // Correct for TZ offset at that civil moment.
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
  const offsetMs = asLocal - utcGuess.getTime();
  const startInstant = new Date(utcGuess.getTime() - offsetMs);
  const leadMs = input.minLeadHours * 60 * 60 * 1000;
  return startInstant.getTime() - now.getTime() < leadMs;
}
