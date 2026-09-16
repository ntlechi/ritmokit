/**
 * Lead/follow seat engine asserts against the real module (no DB).
 * Run: npm run test:parity   (tsx scripts/test-parity.mjs)
 */
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_IMBALANCE,
  evaluateCoupleEnrollment,
  evaluateParityEnrollment,
  getParityLock,
} from "../src/lib/dance/parity.ts";

assert.equal(DEFAULT_MAX_IMBALANCE, 2);

// Balanced room seats both roles.
{
  const cap = { maxLeads: 12, maxFollows: 12, filledLeads: 5, filledFollows: 5 };
  assert.deepEqual(evaluateParityEnrollment(cap, "LEAD", { allowWaitlist: false }), {
    ok: true,
    waitlisted: false,
  });
  assert.deepEqual(evaluateParityEnrollment(cap, "FOLLOW", { allowWaitlist: false }), {
    ok: true,
    waitlisted: false,
  });
  assert.equal(getParityLock(cap), null);
}

// Gap of 1 → 2 is still fine (7L/5F, one more LEAD makes Δ3? no: 6L/5F is Δ1; 7L/5F is Δ2).
{
  const cap = { maxLeads: 12, maxFollows: 12, filledLeads: 6, filledFollows: 5 };
  const d = evaluateParityEnrollment(cap, "LEAD", { allowWaitlist: false });
  assert.equal(d.ok, true);
  assert.equal(d.waitlisted, false);
  assert.equal(getParityLock(cap), null);
}

// At Δ2 the surplus role locks: seating another LEAD would make Δ3.
{
  const cap = { maxLeads: 12, maxFollows: 12, filledLeads: 7, filledFollows: 5 };
  assert.equal(getParityLock(cap), "LEAD");

  const waitlisted = evaluateParityEnrollment(cap, "LEAD");
  assert.equal(waitlisted.ok, true);
  assert.equal(waitlisted.waitlisted, true);
  assert.equal(waitlisted.reason, "imbalance");

  const refused = evaluateParityEnrollment(cap, "LEAD", { allowWaitlist: false });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "imbalance");

  // The smaller side always seats — that is how the lock releases.
  assert.deepEqual(evaluateParityEnrollment(cap, "FOLLOW", { allowWaitlist: false }), {
    ok: true,
    waitlisted: false,
  });
}

// Mirror: follows in surplus lock FOLLOW only.
{
  const cap = { maxLeads: 20, maxFollows: 20, filledLeads: 3, filledFollows: 16 };
  assert.equal(getParityLock(cap), "FOLLOW");
  assert.equal(evaluateParityEnrollment(cap, "FOLLOW").waitlisted, true);
  assert.equal(evaluateParityEnrollment(cap, "LEAD").waitlisted, false);
}

// A wildly uneven room still welcomes the smaller side even though Δ stays > 2 after seating.
{
  const cap = { maxLeads: 20, maxFollows: 20, filledLeads: 3, filledFollows: 10 };
  const d = evaluateParityEnrollment(cap, "LEAD", { allowWaitlist: false });
  assert.equal(d.ok, true);
  assert.equal(d.waitlisted, false);
}

// Role pool full takes precedence over imbalance.
{
  const cap = { maxLeads: 2, maxFollows: 12, filledLeads: 2, filledFollows: 2 };
  const d = evaluateParityEnrollment(cap, "LEAD", { allowWaitlist: true });
  assert.equal(d.ok, true);
  assert.equal(d.waitlisted, true);
  assert.equal(d.reason, "role_full");
}

// Custom threshold and disabled threshold (socials).
{
  const cap = { maxLeads: 12, maxFollows: 12, filledLeads: 7, filledFollows: 5 };
  assert.equal(evaluateParityEnrollment(cap, "LEAD", { maxImbalance: 3 }).waitlisted, false);
  assert.equal(evaluateParityEnrollment(cap, "LEAD", { maxImbalance: Infinity }).waitlisted, false);
  assert.equal(getParityLock(cap, Infinity), null);
}

// SOLO ignores the gap; only the total pool matters.
{
  const cap = { maxLeads: 12, maxFollows: 12, filledLeads: 9, filledFollows: 3 };
  assert.deepEqual(evaluateParityEnrollment(cap, "SOLO"), { ok: true, waitlisted: false });
  const full = evaluateParityEnrollment(
    { maxLeads: 5, maxFollows: 5, filledLeads: 5, filledFollows: 5 },
    "SOLO",
  );
  assert.equal(full.waitlisted, true);
  assert.equal(full.reason, "role_full");
}

// Couples never touch the gap: 1L + 1F keeps Δ constant.
{
  const cap = { maxLeads: 12, maxFollows: 12, filledLeads: 7, filledFollows: 5 };
  assert.deepEqual(evaluateCoupleEnrollment(cap), { ok: true, waitlisted: false });
}

console.log("parity asserts OK");
