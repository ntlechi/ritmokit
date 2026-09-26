/**
 * Pure-module asserts for the staff UX redesign (no DB / no server).
 * Run: npm run test:studio-ops   (tsx scripts/test-studio-ops.mjs)
 */
import assert from "node:assert/strict";
import {
  ALMOST_FULL_RATIO,
  balanceState,
  capacityTone,
  classLiveStatus,
  classSlotLabel,
  daysAgo,
  relativeDayLabel,
  wallClockLabel,
} from "../src/lib/dance/class-display.ts";
import {
  initialIntakeStatus,
  isFirstVisit,
  statusOnAttendance,
  statusOnReEnrollment,
} from "../src/lib/dance/intake-rules.ts";
import { filterClassGrid, gridHourRows } from "../src/lib/dance/studio-calendar.ts";

// ---------------------------------------------------------------- capacity tone
assert.equal(ALMOST_FULL_RATIO, 0.85);
assert.equal(capacityTone(0, 20), "open");
assert.equal(capacityTone(16, 20), "open", "80% is still open");
assert.equal(capacityTone(17, 20), "almost", "85% flips to amber");
assert.equal(capacityTone(19, 20), "almost");
assert.equal(capacityTone(20, 20), "full");
assert.equal(capacityTone(22, 20), "full", "overbooked stays full");
assert.equal(capacityTone(0, 0), "open", "no capacity set, nobody booked");
assert.equal(capacityTone(1, 0), "full");

// ---------------------------------------------------------------- lead/follow balance
assert.equal(balanceState(0, 0, 2), "none", "empty class shows no bar");
assert.equal(balanceState(5, 5, 2), "balanced");
assert.equal(balanceState(6, 5, 2), "balanced", "gap 1 < threshold");
assert.equal(balanceState(7, 5, 2), "needsFollows", "gap reaches threshold → leads locked");
assert.equal(balanceState(3, 6, 2), "needsLeads");
assert.equal(balanceState(10, 0, Infinity), "none", "socials never warn");

// ---------------------------------------------------------------- live status
assert.equal(classLiveStatus(18 * 60, 19 * 60, 20 * 60), "upcoming");
assert.equal(classLiveStatus(19 * 60, 19 * 60, 20 * 60), "live");
assert.equal(classLiveStatus(20 * 60, 19 * 60, 20 * 60), "done");

// ---------------------------------------------------------------- labels
assert.equal(wallClockLabel("1970-01-01T19:30:00.000Z"), "19:30");
assert.match(classSlotLabel("fr", 1, "1970-01-01T19:30:00.000Z"), /^lun\.? 19:30$/);
assert.match(classSlotLabel("en", 0, "1970-01-01T08:05:00.000Z"), /^Sun 08:05$/);
const now = new Date("2026-09-26T12:00:00Z");
assert.equal(daysAgo("2026-09-26T08:00:00Z", now), 0);
assert.equal(daysAgo("2026-09-24T11:00:00Z", now), 2);
const copy = { today: "today", yesterday: "yesterday", daysAgo: "{n}d ago" };
assert.equal(relativeDayLabel("2026-09-25T10:00:00Z", copy, now), "yesterday");
assert.equal(relativeDayLabel("2026-09-20T10:00:00Z", copy, now), "6d ago");

// ---------------------------------------------------------------- intake transitions
assert.equal(initialIntakeStatus(0), "NEW");
assert.equal(initialIntakeStatus(3), "ACTIVE", "long-time students are not new");
assert.equal(statusOnAttendance("NEW"), "ATTENDED");
assert.equal(statusOnAttendance("CONTACTED"), "ATTENDED");
assert.equal(statusOnAttendance("ACTIVE"), null);
assert.equal(statusOnReEnrollment("ATTENDED"), "ACTIVE");
assert.equal(statusOnReEnrollment("LOST"), "ACTIVE");
assert.equal(statusOnReEnrollment("NEW"), null, "a second booking before the first class stays NEW");

// ---------------------------------------------------------------- first-visit flag
assert.equal(isFirstVisit("NEW", null, now), true);
assert.equal(isFirstVisit("ATTENDED", "2026-09-26T09:00:00Z", now), true, "checked in tonight");
assert.equal(isFirstVisit("ATTENDED", "2026-09-25T09:00:00Z", now), false, "past the grace window");
assert.equal(isFirstVisit("ACTIVE", null, now), false);
assert.equal(isFirstVisit(null, null, now), false);

// ---------------------------------------------------------------- week grid filters
{
  const base = { roomId: "r", roomName: "A", onWebsite: true, status: "ACTIVE", href: "#", attended: 0, paymentStatus: null, subtitle: "" };
  const events = [
    { ...base, id: "c1", kind: "class", date: "2026-09-28", timeStart: "19:00", timeEnd: "20:00", title: "Salsa 1", booked: 10, capacity: 20, style: "Salsa", isSocial: false, classInfo: { instructorId: "t1" } },
    { ...base, id: "c2", kind: "class", date: "2026-09-28", timeStart: "18:30", timeEnd: "19:30", title: "Bachata 1", booked: 5, capacity: 20, style: "Bachata", isSocial: false, classInfo: { instructorId: "t2" } },
    { ...base, id: "r1", kind: "rental", date: "2026-09-29", timeStart: "20:00", timeEnd: "22:00", title: "Rental", booked: null, capacity: null, style: null, isSocial: false },
  ];
  assert.equal(filterClassGrid(events, { instructorId: null, style: null }).length, 3);
  assert.deepEqual(
    filterClassGrid(events, { instructorId: "t1", style: null }).map((e) => e.id),
    ["c1"],
    "teacher filter hides other classes and rentals",
  );
  assert.deepEqual(
    filterClassGrid(events, { instructorId: null, style: "bachata" }).map((e) => e.id),
    ["c2"],
    "style filter is case-insensitive",
  );
  assert.deepEqual(gridHourRows(events), ["18", "19", "20"]);
}

console.log("studio-ops: all assertions passed");
