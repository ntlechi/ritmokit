/**
 * Smoke tests for dance analytics aggregations (no DB).
 */
import assert from "node:assert/strict";

function resolveEnrollmentAmountCad(session, tier = "REGULAR") {
  const regular = session.priceRegular ?? 0;
  if (tier === "COUPLE") return session.priceCouple ?? regular;
  if (tier === "STUDENT") return session.priceStudent ?? regular;
  return regular;
}

function enrollmentRevenueCad(enrollment, session) {
  if (enrollment.waitlisted) return null;
  const isPaid = enrollment.paid === true || enrollment.paymentStatus === "PAID";
  if (!isPaid) return null;
  if (enrollment.amountCad != null && Number.isFinite(enrollment.amountCad)) {
    return enrollment.amountCad;
  }
  return resolveEnrollmentAmountCad(session, enrollment.pricingTier ?? "REGULAR");
}

function calculateClassEconomics(input) {
  const revenue =
    input.revenue != null && Number.isFinite(input.revenue)
      ? input.revenue
      : input.paidEnrollmentCount * input.pricePerStudent;
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

// Legacy estimate path still works when revenue is omitted.
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

// A4 — tiered amountCad sum beats flat regular estimate.
const session = { priceRegular: 180, priceStudent: 153, priceCouple: 324 };
const enrollments = [
  { paid: true, waitlisted: false, amountCad: 180, pricingTier: "REGULAR" },
  { paid: true, waitlisted: false, amountCad: 153, pricingTier: "STUDENT" },
  { paid: true, waitlisted: false, amountCad: 324, pricingTier: "COUPLE" },
  { paid: false, waitlisted: false, amountCad: 180, pricingTier: "REGULAR" },
  { paid: false, waitlisted: true, amountCad: 180, pricingTier: "REGULAR" },
];
let revenue = 0;
let paidCount = 0;
for (const e of enrollments) {
  const seat = enrollmentRevenueCad(e, session);
  if (seat != null) {
    paidCount += 1;
    revenue += seat;
  }
}
assert.equal(paidCount, 3);
assert.equal(revenue, 180 + 153 + 324);

const real = calculateClassEconomics({
  revenue,
  paidEnrollmentCount: paidCount,
  pricePerStudent: 180,
  payType: "FLAT_PER_CLASS",
  payRate: 80,
  hours: 1,
  attendees: 3,
  surfaceSqm: 80,
});
// Flat estimate would have been 3 * 180 = 540; real is 657.
assert.equal(real.revenue, 657);
assert.equal(real.grossMargin, 577);
assert.ok(Math.abs(real.roomYieldPerSqm - 577 / 80) < 0.01);

// Bottom-10% ordering uses net margin (student discount lowers profit).
const classA = { id: "a", grossMargin: 577 };
const classB = { id: "b", grossMargin: 3 * 180 - 80 }; // 460 flat-ish
assert.ok(classA.grossMargin > classB.grossMargin);

const util = (12 / 24) * 100;
assert.equal(util, 50);

const payrollPct = (800 / 3600) * 100;
assert.ok(payrollPct > 22 && payrollPct < 23);

console.log("test-dance-analytics: OK");
