import type { InstructorPayType } from "@/generated/prisma/enums";

export type ClassEconomicsInput = {
  /**
   * Explicit revenue (preferred — sum of paid Enrollment.amountCad).
   * When omitted, falls back to paidEnrollmentCount × pricePerStudent.
   */
  revenue?: number;
  paidEnrollmentCount: number;
  pricePerStudent: number;
  payType: InstructorPayType | null;
  payRate: number | null;
  /** Duration in hours (for HOURLY). */
  hours: number;
  /** Present attendees (for COMMISSION). */
  attendees: number;
  surfaceSqm: number | null;
};

export type ClassEconomics = {
  revenue: number;
  instructorCost: number;
  grossMargin: number;
  roomYieldPerSqm: number | null;
};

export function calculateClassEconomics(input: ClassEconomicsInput): ClassEconomics {
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
