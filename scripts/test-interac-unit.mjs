/**
 * Unit tests for Interac ticket / door status helpers (no DB).
 */
import assert from "node:assert/strict";
import {
  amountToCents,
  doorStatusFromPayment,
  parseTicketCode,
  publicPaymentStatus,
  ticketCodeForEnrollment,
} from "../src/lib/payments/interac-status.ts";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
assert.equal(ticketCodeForEnrollment(id), `RK|${id}`);
assert.equal(parseTicketCode(`RK|${id}`), id);
assert.equal(parseTicketCode(`SA|${id}`), id);
assert.equal(parseTicketCode(`SA|enr_${id}`), id);
assert.equal(parseTicketCode(id), id);
assert.equal(parseTicketCode("nope"), null);

assert.equal(publicPaymentStatus("PENDING_INTERAC"), "pending_interac");
assert.equal(publicPaymentStatus("PAID"), "paid");
assert.equal(publicPaymentStatus("CANCELLED_INTERAC"), "cancelled_interac");
assert.equal(publicPaymentStatus("PENDING", "PAYPAL"), "pending_paypal");
assert.equal(publicPaymentStatus("NONE"), "none");

assert.equal(amountToCents(180), 18000);
assert.equal(amountToCents(180.5), 18050);

assert.equal(
  doorStatusFromPayment({ waitlisted: false, paid: false, paymentStatus: "PENDING_INTERAC" }),
  "UNPAID",
);
assert.equal(
  doorStatusFromPayment({ waitlisted: false, paid: true, paymentStatus: "PAID" }),
  "ALLOW",
);
assert.equal(
  doorStatusFromPayment({ waitlisted: false, paid: false, paymentStatus: "CANCELLED_INTERAC" }),
  "CANCELLED",
);
assert.equal(
  doorStatusFromPayment({ waitlisted: true, paid: false, paymentStatus: "NONE" }),
  "WAITLIST",
);

console.log("test-interac-unit: OK");
