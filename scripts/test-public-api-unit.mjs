/**
 * Unit smoke tests for public API helpers (no DB / no server).
 */
import assert from "node:assert/strict";
import {
  evaluateParityEnrollment,
  getClassAvailability,
  getPackagePeers,
} from "../src/lib/dance/parity.ts";
import { buildPayPalInvoiceId } from "../src/lib/payments/paypal-invoice-id.ts";

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

const classes = [
  { id: "a", courseTitle: "Salsa 1" },
  { id: "b", courseTitle: "Salsa 1" },
  { id: "c", courseTitle: "Bachata 2" },
];
const peers = getPackagePeers(classes, classes[0]);
assert.equal(peers.length, 2);
assert.deepEqual(
  peers.map((p) => p.id).sort(),
  ["a", "b"],
);

const enrollmentId = "11111111-2222-3333-4444-555555555555";
const inv1 = buildPayPalInvoiceId(enrollmentId, "nonce1");
const inv2 = buildPayPalInvoiceId(enrollmentId, "nonce2");
assert.notEqual(inv1, inv2);
assert.match(inv1, /^rk_[0-9a-f]{12}_nonce1$/);
assert.notEqual(inv1, `rk_${enrollmentId.replace(/-/g, "").slice(0, 12)}`);

console.log("test-public-api-unit: OK");
