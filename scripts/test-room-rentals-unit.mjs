/**
 * Unit tests for room rental availability engine (no DB).
 * Ported fixtures mirror Salsa Attitude rentalSchedule behavior.
 */
import assert from "node:assert/strict";
import {
  isSlotAvailable,
  getAvailableStartTimes,
  getDayAvailabilitySummary,
  estimateRentalPriceCents,
  rangesOverlap,
  violatesMinLead,
  buildRoomDayTimeline,
  validateRentalWindow,
  computeRentalHoldExpiry,
  findRentalConflictsForClass,
} from "../src/lib/rentals/schedule.ts";

assert.equal(rangesOverlap(600, 660, 630, 690), true);
assert.equal(rangesOverlap(600, 660, 660, 720), false);

const classes = [
  {
    roomId: "rdc-a",
    dayOfWeek: 2, // Tuesday
    timeStart: "19:00",
    timeEnd: "20:30",
    label: "Salsa N2",
  },
];

const bookings = [
  {
    roomId: "rdc-a",
    date: "2026-09-15",
    timeStart: "14:00",
    timeEnd: "16:00",
    type: "prive",
    status: "confirmed",
  },
];

// 2026-09-15 is a Tuesday
const dateIso = "2026-09-15";

const blockedByClass = isSlotAvailable({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso,
  timeStart: "19:00",
  timeEnd: "20:00",
  bufferMinutes: 15,
});
assert.equal(blockedByClass.ok, false);

// Buffer after booking: 16:00 + 15 = 16:15 blocks 16:00–17:00
const blockedByBuffer = isSlotAvailable({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso,
  timeStart: "16:00",
  timeEnd: "17:00",
  bufferMinutes: 15,
});
assert.equal(blockedByBuffer.ok, false);

// Free after buffer
const freeAfterBuffer = isSlotAvailable({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso,
  timeStart: "16:15",
  timeEnd: "17:15",
  bufferMinutes: 15,
});
assert.equal(freeAfterBuffer.ok, true);

// No post-class buffer: 20:30 start is OK
const rightAfterClass = isSlotAvailable({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso,
  timeStart: "20:30",
  timeEnd: "21:30",
  bufferMinutes: 15,
});
assert.equal(rightAfterClass.ok, true);

const slots = getAvailableStartTimes({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso,
  durationMinutes: 60,
  openHour: 8,
  closeHour: 23,
  bufferMinutes: 15,
});
assert.ok(slots.some((s) => s.start === "10:00"));
assert.ok(!slots.some((s) => s.start === "14:00"));
assert.ok(!slots.some((s) => s.start === "19:00"));

assert.equal(estimateRentalPriceCents(4500, 90), 6750);

const summary = getDayAvailabilitySummary({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso,
  durationMinutes: 60,
  todayIso: "2026-09-01",
});
assert.equal(summary.status, "mixed");
assert.ok(summary.slotsAvailable > 0);

const past = getDayAvailabilitySummary({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso: "2026-08-01",
  todayIso: "2026-09-01",
});
assert.equal(past.status, "past");

const timeline = buildRoomDayTimeline({
  classes,
  bookings,
  roomId: "rdc-a",
  dateIso,
  openHour: 8,
  closeHour: 23,
  bufferMinutes: 15,
});
assert.ok(timeline.segments.some((s) => s.type === "class"));
assert.ok(timeline.segments.some((s) => s.type === "available"));

assert.equal(
  violatesMinLead({
    dateIso: "2026-09-15",
    timeStart: "10:00",
    minLeadHours: 24,
    timeZone: "America/Toronto",
    now: new Date("2026-09-15T12:00:00Z"),
  }),
  true,
);

assert.equal(
  violatesMinLead({
    dateIso: "2026-09-20",
    timeStart: "10:00",
    minLeadHours: 24,
    timeZone: "America/Toronto",
    now: new Date("2026-09-15T12:00:00Z"),
  }),
  false,
);

// A past start always violates, even with no lead time configured.
assert.equal(
  violatesMinLead({
    dateIso: "2026-09-15",
    timeStart: "07:00",
    minLeadHours: 0,
    timeZone: "America/Toronto",
    now: new Date("2026-09-15T12:00:00Z"),
  }),
  true,
);

// The requested rental needs its own changeover before the next booking:
// 12:00–13:50 + 15 min buffer runs into the 14:00 booking.
assert.equal(
  isSlotAvailable({ classes, bookings, roomId: "rdc-a", dateIso, timeStart: "12:00", timeEnd: "13:50", bufferMinutes: 15 }).ok,
  false,
);
assert.equal(
  isSlotAvailable({ classes, bookings, roomId: "rdc-a", dateIso, timeStart: "12:00", timeEnd: "13:45", bufferMinutes: 15 }).ok,
  true,
);
// …and before a class (renters must be out before students arrive).
assert.equal(
  isSlotAvailable({ classes, bookings, roomId: "rdc-a", dateIso, timeStart: "17:45", timeEnd: "18:55", bufferMinutes: 15 }).ok,
  false,
);
assert.equal(
  isSlotAvailable({ classes, bookings, roomId: "rdc-a", dateIso, timeStart: "17:45", timeEnd: "18:45", bufferMinutes: 15 }).ok,
  true,
);

// Weekly classes only block inside their season dates.
const seasonClasses = [
  { roomId: "rdc-a", dayOfWeek: 2, timeStart: "19:00", timeEnd: "20:30", label: "Salsa N2", validFrom: "2026-09-08", validTo: "2026-12-15" },
];
const inSeason = { classes: seasonClasses, bookings: [], roomId: "rdc-a", timeStart: "19:00", timeEnd: "20:00", bufferMinutes: 15 };
assert.equal(isSlotAvailable({ ...inSeason, dateIso: "2026-09-15" }).ok, false);
assert.equal(isSlotAvailable({ ...inSeason, dateIso: "2026-09-01" }).ok, true, "before season start");
assert.equal(isSlotAvailable({ ...inSeason, dateIso: "2026-12-22" }).ok, true, "after season end");
assert.equal(isSlotAvailable({ ...inSeason, dateIso: "2026-12-15" }).ok, false, "season end is inclusive");

// One-off classes block only their own date.
const oneOff = [
  { roomId: "rdc-a", dayOfWeek: null, dateIso: "2026-10-03", timeStart: "13:00", timeEnd: "16:00", label: "Bootcamp" },
];
const oneOffSlot = { classes: oneOff, bookings: [], roomId: "rdc-a", timeStart: "14:00", timeEnd: "15:00", bufferMinutes: 15 };
assert.equal(isSlotAvailable({ ...oneOffSlot, dateIso: "2026-10-03" }).ok, false);
assert.equal(isSlotAvailable({ ...oneOffSlot, dateIso: "2026-10-10" }).ok, true);

// Window rules: public bookings respect hours, the 30-min grid and offered durations.
const hours = { openHour: 8, closeHour: 23, durationOptions: [60, 90, 120] };
assert.equal(validateRentalWindow({ ...hours, timeStart: "10:00", timeEnd: "11:30", mode: "public" }), null);
assert.equal(validateRentalWindow({ ...hours, timeStart: "07:00", timeEnd: "08:00", mode: "public" }), "outside_hours");
assert.equal(validateRentalWindow({ ...hours, timeStart: "22:30", timeEnd: "23:30", mode: "public" }), "outside_hours");
assert.equal(validateRentalWindow({ ...hours, timeStart: "10:15", timeEnd: "11:15", mode: "public" }), "invalid_time_range");
assert.equal(validateRentalWindow({ ...hours, timeStart: "10:00", timeEnd: "10:45", mode: "public" }), "invalid_duration");
assert.equal(validateRentalWindow({ ...hours, timeStart: "11:00", timeEnd: "10:00", mode: "public" }), "invalid_time_range");
// Staff can book any sane window (early rehearsal, odd lengths).
assert.equal(validateRentalWindow({ ...hours, timeStart: "07:15", timeEnd: "08:00", mode: "staff" }), null);
assert.equal(validateRentalWindow({ ...hours, timeStart: "09:00", timeEnd: "09:00", mode: "staff" }), "invalid_time_range");

// Unpaid hold expiry: min(now + 24 h, start − 2 h); inside 2 h, hold until start.
// Toronto is UTC−4 in September, so 2026-09-20 10:00 local = 14:00Z.
const holdNow = new Date("2026-09-15T12:00:00Z");
assert.equal(
  computeRentalHoldExpiry({ dateIso: "2026-09-20", timeStart: "10:00", timeZone: "America/Toronto", now: holdNow }).toISOString(),
  "2026-09-16T12:00:00.000Z",
  "far booking: 24 h hold",
);
assert.equal(
  computeRentalHoldExpiry({ dateIso: "2026-09-15", timeStart: "20:00", timeZone: "America/Toronto", now: holdNow }).toISOString(),
  "2026-09-15T22:00:00.000Z",
  "same-day booking: 2 h before start",
);
assert.equal(
  computeRentalHoldExpiry({ dateIso: "2026-09-15", timeStart: "09:00", timeZone: "America/Toronto", now: holdNow }).toISOString(),
  "2026-09-15T13:00:00.000Z",
  "starts within 2 h: hold until start",
);

// Expired bookings free their slot just like cancelled ones.
assert.equal(
  isSlotAvailable({
    classes: [],
    bookings: [{ roomId: "rdc-a", date: dateIso, timeStart: "14:00", timeEnd: "16:00", status: "expired" }],
    roomId: "rdc-a",
    dateIso,
    timeStart: "14:00",
    timeEnd: "15:00",
  }).ok,
  true,
);

// Class → rental collisions (the inverse check used when scheduling classes).
const rentalsOnFile = [
  { date: "2026-10-03", timeStart: "12:00", timeEnd: "14:00", clientName: "Compagnie Élan" }, // Saturday
  { date: "2026-10-10", timeStart: "18:00", timeEnd: "19:00", clientName: "Troupe Nova" }, // Saturday
  { date: "2026-10-06", timeStart: "19:00", timeEnd: "20:00", clientName: "Mardi Crew" }, // Tuesday
];
const weeklySat = { rentals: rentalsOnFile, dayOfWeek: 6, validFrom: "2026-09-26", validTo: "2026-12-13", bufferMinutes: 15 };
assert.deepEqual(
  findRentalConflictsForClass({ ...weeklySat, timeStart: "13:00", timeEnd: "14:00" }).map((r) => r.clientName),
  ["Compagnie Élan"],
);
assert.equal(
  findRentalConflictsForClass({ ...weeklySat, timeStart: "14:00", timeEnd: "15:00" }).length,
  1,
  "class can't start during the renter's 15-min changeover",
);
assert.equal(findRentalConflictsForClass({ ...weeklySat, timeStart: "14:15", timeEnd: "15:00" }).length, 0);
assert.equal(
  findRentalConflictsForClass({ ...weeklySat, timeStart: "11:00", timeEnd: "12:00" }).length,
  0,
  "class may end exactly when the rental starts",
);
assert.equal(
  findRentalConflictsForClass({ ...weeklySat, validTo: "2026-10-05", timeStart: "18:00", timeEnd: "19:00" }).length,
  0,
  "season ends before the Oct 10 rental",
);
assert.equal(
  findRentalConflictsForClass({ ...weeklySat, dayOfWeek: 2, timeStart: "12:00", timeEnd: "14:00" }).length,
  0,
  "other weekday",
);
assert.deepEqual(
  findRentalConflictsForClass({
    rentals: rentalsOnFile,
    dayOfWeek: null,
    dateIso: "2026-10-06",
    timeStart: "19:30",
    timeEnd: "21:00",
    validFrom: "2026-10-06",
    validTo: "2026-10-06",
  }).map((r) => r.clientName),
  ["Mardi Crew"],
  "one-off class hits its own date",
);

// Free-slot count honours minimum notice: at 12:00Z (08:00 Toronto) with 24 h
// notice, nothing today or before 08:00 tomorrow is bookable.
const leadNow = new Date("2026-09-15T12:00:00Z");
const todayLead = getDayAvailabilitySummary({
  classes: [],
  bookings: [],
  roomId: "rdc-a",
  dateIso: "2026-09-15",
  todayIso: "2026-09-15",
  minLeadHours: 24,
  timeZone: "America/Toronto",
  now: leadNow,
});
assert.equal(todayLead.slotsAvailable, 0);
assert.equal(todayLead.status, "past", "too late to book reads as closed, not full");
const tomorrowLead = getDayAvailabilitySummary({
  classes: [],
  bookings: [],
  roomId: "rdc-a",
  dateIso: "2026-09-16",
  todayIso: "2026-09-15",
  durationMinutes: 60,
  openHour: 8,
  closeHour: 23,
  minLeadHours: 24,
  timeZone: "America/Toronto",
  now: leadNow,
});
const tomorrowOpen = getDayAvailabilitySummary({
  classes: [],
  bookings: [],
  roomId: "rdc-a",
  dateIso: "2026-09-16",
  todayIso: "2026-09-15",
  durationMinutes: 60,
  openHour: 8,
  closeHour: 23,
});
assert.equal(tomorrowOpen.slotsAvailable, 29);
assert.equal(tomorrowLead.slotsAvailable, 29, "08:00 tomorrow is exactly 24 h out");
const tomorrowLate = getDayAvailabilitySummary({
  classes: [],
  bookings: [],
  roomId: "rdc-a",
  dateIso: "2026-09-16",
  todayIso: "2026-09-15",
  durationMinutes: 60,
  openHour: 8,
  closeHour: 23,
  minLeadHours: 24,
  timeZone: "America/Toronto",
  now: new Date("2026-09-15T14:00:00Z"),
});
assert.equal(tomorrowLate.slotsAvailable, 25, "08:00–09:30 tomorrow fall inside the notice");

console.log("test-room-rentals-unit: OK");
