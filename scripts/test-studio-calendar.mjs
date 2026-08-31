import assert from "node:assert/strict";
import {
  addCivilDays,
  classIsOnWebsite,
  dayCounts,
  eachCivilDay,
  expandRecurringDates,
  filterStudioEvents,
  oneOffInRange,
  weekdayFromCivil,
} from "../src/lib/dance/studio-calendar.ts";

assert.equal(weekdayFromCivil("2026-08-28"), 5); // Friday
assert.equal(addCivilDays("2026-08-28", 3), "2026-08-31");
assert.deepEqual(eachCivilDay("2026-08-28", "2026-08-31"), [
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
]);

const tuesdays = expandRecurringDates(
  { dayOfWeek: 2, seasonStartsOn: "2026-09-01", seasonEndsOn: "2026-09-30" },
  "2026-08-01",
  "2026-10-01",
);
assert.equal(tuesdays[0], "2026-09-01");
assert.equal(tuesdays.at(-1), "2026-09-29");
assert.ok(tuesdays.every((d) => weekdayFromCivil(d) === 2));

assert.equal(
  expandRecurringDates(
    { dayOfWeek: 2, seasonStartsOn: "2026-10-01", seasonEndsOn: "2026-12-01" },
    "2026-08-01",
    "2026-09-01",
  ).length,
  0,
);

assert.equal(oneOffInRange("2026-08-28", "2026-08-01", "2026-09-01"), true);
assert.equal(oneOffInRange("2026-09-01", "2026-08-01", "2026-09-01"), false);

assert.equal(classIsOnWebsite(null, "season-live"), true);
assert.equal(classIsOnWebsite("season-live", "season-live"), true);
assert.equal(classIsOnWebsite("season-draft", "season-live"), false);
assert.equal(classIsOnWebsite("season-live", null), false);

const filtered = filterStudioEvents(
  [
    {
      id: "c1",
      kind: "class",
      date: "2026-08-28",
      timeStart: "19:00",
      timeEnd: "20:30",
      title: "Salsa N2",
      subtitle: "Steve",
      roomId: "a",
      roomName: "A",
      onWebsite: true,
      status: "ACTIVE",
      href: "/fr/sessions",
      booked: 12,
      attended: 9,
      capacity: 24,
      style: "Salsa",
      isSocial: false,
      paymentStatus: null,
    },
    {
      id: "r1",
      kind: "rental",
      date: "2026-08-28",
      timeStart: "14:00",
      timeEnd: "16:00",
      title: "Corp",
      subtitle: "b2b",
      roomId: "b",
      roomName: "B",
      onWebsite: true,
      status: "CONFIRMED",
      href: "/fr/rentals",
      booked: null,
      attended: null,
      capacity: null,
      style: null,
      isSocial: false,
      paymentStatus: "PENDING_INTERAC",
    },
  ],
  "class",
  null,
);
assert.equal(filtered.length, 1);
assert.equal(filtered[0].id, "c1");

const counts = dayCounts(filtered);
assert.deepEqual(counts.get("2026-08-28"), { classes: 1, rentals: 0 });

console.log("studio-calendar unit tests ok");
