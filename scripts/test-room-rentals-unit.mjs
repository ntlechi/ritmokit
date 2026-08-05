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

console.log("test-room-rentals-unit: OK");
