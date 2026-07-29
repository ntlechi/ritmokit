import type { NextRequest } from "next/server";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { asPlainNumber } from "@/lib/data/serialize";
import { createEnrollmentCheckout } from "@/lib/public-api/payments";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/**
 * POST /api/public/enrollments/:id/checkout
 * Regenerate a PayPal approve link for unpaid, non-waitlisted enrollments.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return publicJson(request, { error: "invalid_id" }, { status: 400 });
  }

  let body: { returnUrl?: string; cancelUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: {
      student: { select: { email: true } },
      session: { select: { id: true, course: { select: { title: true } } } },
    },
  });

  if (!enrollment) {
    return publicJson(request, { error: "not_found" }, { status: 404 });
  }
  if (enrollment.paid || enrollment.paymentStatus === "PAID") {
    return publicJson(request, { error: "already_paid", paid: true }, { status: 409 });
  }
  if (enrollment.waitlisted) {
    return publicJson(request, { error: "still_waitlisted" }, { status: 409 });
  }

  const amountCad =
    enrollment.amountCad != null ? asPlainNumber(enrollment.amountCad) : 0;
  if (amountCad <= 0) {
    return publicJson(request, { error: "invalid_amount" }, { status: 422 });
  }

  try {
    const payment = await createEnrollmentCheckout({
      provider: "paypal",
      amountCad,
      enrollmentId: enrollment.id,
      sessionId: enrollment.session.id,
      studentEmail: enrollment.student.email,
      description: enrollment.session.course.title,
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl,
    });

    if (payment.paymentRef) {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          paymentRef: payment.paymentRef,
          paymentStatus: payment.status === "pending" ? "PENDING" : enrollment.paymentStatus,
        },
      });
    }

    return publicJson(request, {
      ok: true,
      enrollmentId: enrollment.id,
      checkoutUrl: payment.checkoutUrl,
      payment,
    });
  } catch (error) {
    console.error("[public:checkout]", error);
    return publicJson(request, { error: "checkout_failed" }, { status: 502 });
  }
}
