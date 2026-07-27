/**
 * Pure-function smoke asserts for lead/follow parity (no DB).
 * Run: node scripts/test-parity.mjs
 */
import assert from "node:assert/strict";

const DEFAULT_MAX_IMBALANCE = 2;

function getClassAvailability(cap) {
  const leadsFree = Math.max(0, cap.maxLeads - cap.filledLeads);
  const followsFree = Math.max(0, cap.maxFollows - cap.filledFollows);
  return {
    leadsFree,
    followsFree,
    full: leadsFree <= 0 && followsFree <= 0,
    imbalance: Math.abs(cap.filledLeads - cap.filledFollows),
  };
}

function evaluateParityEnrollment(cap, role, options = {}) {
  const maxImbalance = options.maxImbalance ?? DEFAULT_MAX_IMBALANCE;
  const allowWaitlist = options.allowWaitlist ?? true;
  const avail = getClassAvailability(cap);
  const free = role === "LEAD" ? avail.leadsFree : avail.followsFree;
  if (free <= 0) {
    return allowWaitlist
      ? { ok: true, waitlisted: true, reason: "role_full" }
      : { ok: false, reason: "role_full", waitlisted: false };
  }
  const nextLeads = cap.filledLeads + (role === "LEAD" ? 1 : 0);
  const nextFollows = cap.filledFollows + (role === "FOLLOW" ? 1 : 0);
  if (Math.abs(nextLeads - nextFollows) > maxImbalance) {
    return allowWaitlist
      ? { ok: true, waitlisted: true, reason: "imbalance" }
      : { ok: false, reason: "imbalance", waitlisted: false };
  }
  return { ok: true, waitlisted: false };
}

// Balanced class — lead OK
{
  const d = evaluateParityEnrollment(
    { maxLeads: 12, maxFollows: 12, filledLeads: 5, filledFollows: 5 },
    "LEAD",
    { allowWaitlist: false },
  );
  assert.equal(d.ok, true);
  assert.equal(d.waitlisted, false);
}

// Imbalance +2 already, another lead blocked
{
  const d = evaluateParityEnrollment(
    { maxLeads: 12, maxFollows: 12, filledLeads: 7, filledFollows: 5 },
    "LEAD",
    { allowWaitlist: false },
  );
  assert.equal(d.ok, false);
  assert.equal(d.reason, "imbalance");
}

// Follow can join to rebalance
{
  const d = evaluateParityEnrollment(
    { maxLeads: 12, maxFollows: 12, filledLeads: 7, filledFollows: 5 },
    "FOLLOW",
    { allowWaitlist: false },
  );
  assert.equal(d.ok, true);
}

// Role full → waitlist
{
  const d = evaluateParityEnrollment(
    { maxLeads: 2, maxFollows: 12, filledLeads: 2, filledFollows: 2 },
    "LEAD",
    { allowWaitlist: true },
  );
  assert.equal(d.ok, true);
  assert.equal(d.waitlisted, true);
  assert.equal(d.reason, "role_full");
}

console.log("parity asserts OK");
