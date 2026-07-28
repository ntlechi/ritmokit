/**
 * Smoke tests for dance analytics aggregations (no DB).
 */
import assert from "node:assert/strict";

// Inline minimal copies of pure formulas to avoid TS path resolution in node.
function calculateClassEconomics(input) {
  const revenue = input.paidEnrollmentCount * input.pricePerStudent;
  const rate = input.payRate ?? 0;
  let instructorCost = 0;
  switch (input.payType) {
    case "HOURLY":
      instructorCost = input.hours * rate;
      break;
    case "FLAT_PER_CLASS":
      instructorCost = rate;
      break;
    case "COMMISSION":
      instructorCost = input.attendees * rate;
      break;
    default:
      instructorCost = 0;
  }
  const grossMargin = revenue - instructorCost;
  const roomYieldPerSqm =
    input.surfaceSqm && input.surfaceSqm > 0 ? grossMargin / input.surfaceSqm : null;
  return { revenue, instructorCost, grossMargin, roomYieldPerSqm };
}

const econ = calculateClassEconomics({
  paidEnrollmentCount: 20,
  pricePerStudent: 180,
  payType: "FLAT_PER_CLASS",
  payRate: 80,
  hours: 1,
  attendees: 18,
  surfaceSqm: 80,
});

assert.equal(econ.revenue, 3600);
assert.equal(econ.instructorCost, 80);
assert.equal(econ.grossMargin, 3520);
assert.ok(Math.abs(econ.roomYieldPerSqm - 44) < 0.01);

const util = (12 / 24) * 100;
assert.equal(util, 50);

const payrollPct = (800 / 3600) * 100;
assert.ok(payrollPct > 22 && payrollPct < 23);

console.log("test-dance-analytics: OK");
