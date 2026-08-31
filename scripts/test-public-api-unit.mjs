/**
 * Unit smoke tests for public API helpers (no DB / no server).
 */
import assert from "node:assert/strict";
import {
  evaluateCoupleEnrollment,
  evaluateParityEnrollment,
  getClassAvailability,
  getPackagePeers,
} from "../src/lib/dance/parity.ts";
import { adviseInscription } from "../src/lib/dance/inscription-advisor.ts";
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

const followHeavy = { maxLeads: 12, maxFollows: 12, filledLeads: 3, filledFollows: 8 };
const followSolo = evaluateParityEnrollment(followHeavy, "FOLLOW", { allowWaitlist: true });
assert.equal(followSolo.waitlisted, true);
const coupleOk = evaluateCoupleEnrollment(followHeavy);
assert.equal(coupleOk.ok, true);
assert.equal(coupleOk.waitlisted, false);

const advised = adviseInscription(
  [
    {
      id: "tue-bach",
      title: "Bachata 1",
      style: "Bachata",
      level: "BEGINNER",
      dayOfWeek: 2,
      startTime: "19:00",
      capacity: followHeavy,
    },
    {
      id: "thu-salsa",
      title: "Salsa 1",
      style: "Salsa",
      level: "BEGINNER",
      dayOfWeek: 4,
      startTime: "19:00",
      capacity: { maxLeads: 12, maxFollows: 12, filledLeads: 6, filledFollows: 6 },
    },
  ],
  { role: "FOLLOW", style: "bachata", dayOfWeek: 2, withPartner: true },
);
assert.equal(advised.verdict, "partner_unlocks");
assert.equal(advised.offers[0]?.status, "partner_confirmed");

const alt = adviseInscription(
  [
    {
      id: "tue-bach",
      title: "Bachata 1",
      style: "Bachata",
      level: "BEGINNER",
      dayOfWeek: 2,
      startTime: "19:00",
      capacity: followHeavy,
    },
    {
      id: "thu-bach",
      title: "Bachata 1",
      style: "Bachata",
      level: "BEGINNER",
      dayOfWeek: 4,
      startTime: "19:00",
      capacity: { maxLeads: 12, maxFollows: 12, filledLeads: 5, filledFollows: 5 },
    },
  ],
  { role: "FOLLOW", style: "bachata", dayOfWeek: 2 },
);
assert.equal(alt.verdict, "alternate");

const coupleFull = evaluateCoupleEnrollment({
  maxLeads: 8,
  maxFollows: 8,
  filledLeads: 8,
  filledFollows: 4,
});
assert.equal(coupleFull.ok, false);

console.log("test-public-api-unit: OK");
