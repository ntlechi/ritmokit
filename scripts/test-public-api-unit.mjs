/**
 * Unit smoke tests for public API helpers (no DB / no server).
 */
import assert from "node:assert/strict";
import { evaluateParityEnrollment, getClassAvailability } from "../src/lib/dance/parity.ts";

const cap = { maxLeads: 12, maxFollows: 12, filledLeads: 8, filledFollows: 8 };
const avail = getClassAvailability(cap);
assert.equal(avail.leadsFree, 4);
assert.equal(avail.followsFree, 4);
assert.equal(avail.imbalance, 0);

const leadOk = evaluateParityEnrollment(cap, "LEAD", { allowWaitlist: false });
assert.equal(leadOk.ok, true);
assert.equal(leadOk.waitlisted, false);

// Adding a Lead when Follows lag behind → imbalance waitlist (Δ would be 3).
const leadWait = evaluateParityEnrollment(
  { maxLeads: 12, maxFollows: 12, filledLeads: 10, filledFollows: 8 },
  "LEAD",
  { allowWaitlist: true },
);
assert.equal(leadWait.ok, true);
assert.equal(leadWait.waitlisted, true);
assert.equal(leadWait.reason, "imbalance");

const leadFull = evaluateParityEnrollment(
  { maxLeads: 12, maxFollows: 12, filledLeads: 12, filledFollows: 10 },
  "LEAD",
  { allowWaitlist: false },
);
assert.equal(leadFull.ok, false);
assert.equal(leadFull.reason, "role_full");

console.log("test-public-api-unit: OK");
