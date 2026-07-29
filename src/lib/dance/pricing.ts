/**
 * Pure pricing helpers shared by public enroll + cockpit yield math.
 * Keep free of server-only so analytics aggregates can import it.
 */

export type PricingTier = "REGULAR" | "STUDENT" | "COUPLE" | "UNLIMITED_PASS";

export type SessionPriceList = {
  priceRegular: number;
  priceCouple?: number | null;
  priceStudent?: number | null;
};

/** Resolve CAD amount from the session price list for the chosen tier. */
export function resolveEnrollmentAmountCad(
  session: SessionPriceList,
  tier: PricingTier = "REGULAR",
): number {
  const regular = Number.isFinite(session.priceRegular) ? session.priceRegular : 0;
  if (tier === "COUPLE") {
    return session.priceCouple != null && Number.isFinite(session.priceCouple)
      ? session.priceCouple
      : regular;
  }
  if (tier === "STUDENT") {
    return session.priceStudent != null && Number.isFinite(session.priceStudent)
      ? session.priceStudent
      : regular;
  }
  // UNLIMITED_PASS falls back to regular until pass products exist (Phase B).
  return regular;
}

/**
 * Paid seat revenue contribution.
 * Prefer stored amountCad; fall back to session tier price when null (legacy rows).
 */
export function enrollmentRevenueCad(
  enrollment: {
    paid?: boolean;
    paymentStatus?: string | null;
    waitlisted?: boolean;
    amountCad?: number | null;
    pricingTier?: PricingTier | null;
  },
  session: SessionPriceList,
): number | null {
  if (enrollment.waitlisted) return null;
  const isPaid =
    enrollment.paid === true || enrollment.paymentStatus === "PAID";
  if (!isPaid) return null;

  if (enrollment.amountCad != null && Number.isFinite(enrollment.amountCad)) {
    return enrollment.amountCad;
  }
  return resolveEnrollmentAmountCad(session, enrollment.pricingTier ?? "REGULAR");
}

/** Expected CAD if a waitlisted seat were promoted at its stored tier. */
export function waitlistExpectedAmountCad(
  enrollment: {
    waitlisted?: boolean;
    amountCad?: number | null;
    pricingTier?: PricingTier | null;
  },
  session: SessionPriceList,
): number {
  if (!enrollment.waitlisted) return 0;
  if (enrollment.amountCad != null && Number.isFinite(enrollment.amountCad)) {
    return enrollment.amountCad;
  }
  return resolveEnrollmentAmountCad(session, enrollment.pricingTier ?? "REGULAR");
}
