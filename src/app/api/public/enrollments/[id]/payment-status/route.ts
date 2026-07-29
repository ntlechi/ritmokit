import type { NextRequest } from "next/server";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { asPlainNumber } from "@/lib/data/serialize";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/**
 * GET /api/public/enrollments/:id/payment-status
 * Lightweight poll for BookingModal after PayPal return.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return publicJson(request, { error: "invalid_id" }, { status: 400 });
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    select: {
      id: true,
      paid: true,
      paymentStatus: true,
      paymentRef: true,
      amountCad: true,
      waitlisted: true,
      pricingTier: true,
      paidAt: true,
    },
  });

  if (!enrollment) {
    return publicJson(request, { error: "not_found" }, { status: 404 });
  }

  return publicJson(request, {
    ok: true,
    enrollmentId: enrollment.id,
    paid: enrollment.paid,
    paymentStatus: enrollment.paymentStatus,
    paymentRef: enrollment.paymentRef,
    amountCad: enrollment.amountCad != null ? asPlainNumber(enrollment.amountCad) : null,
    waitlisted: enrollment.waitlisted,
    pricingTier: enrollment.pricingTier,
    paidAt: enrollment.paidAt?.toISOString() ?? null,
  });
}
