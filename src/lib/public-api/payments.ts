/**
 * Payment provider abstraction for public enrollments.
 * Salsa Attitude pilot → PayPal; RitmoKit SaaS billing stays on Stripe separately.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import {
  allowPayPalStub,
  createPayPalOrder,
  isPayPalConfigured,
} from "@/lib/payments/paypal";

export type PaymentProvider = "paypal" | "stripe" | "none";

export type PaymentCheckoutRequest = {
  provider?: PaymentProvider;
  amountCad: number;
  currency?: "CAD";
  enrollmentId: string;
  sessionId: string;
  studentEmail: string;
  description?: string;
  returnUrl?: string | null;
  cancelUrl?: string | null;
};

export type PaymentCheckoutResult = {
  status: "pending" | "paid" | "deferred";
  provider: PaymentProvider;
  /** Hosted checkout URL when provider requires redirect (PayPal/Stripe). */
  checkoutUrl: string | null;
  paymentRef: string | null;
  message: string;
};

function defaultProvider(): PaymentProvider {
  const raw = (process.env.RITMOKIT_PUBLIC_PAYMENT_PROVIDER ?? "none").toLowerCase();
  if (raw === "paypal" || raw === "stripe" || raw === "none") return raw;
  return "none";
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

/** Ensure BookingModal can resume after PayPal using enrollmentId. */
function withEnrollmentId(url: string, enrollmentId: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("enrollmentId")) {
      parsed.searchParams.set("enrollmentId", enrollmentId);
    }
    return parsed.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return url.includes("enrollmentId=")
      ? url
      : `${url}${join}enrollmentId=${encodeURIComponent(enrollmentId)}`;
  }
}

/**
 * Create a checkout intent for an unpaid, non-waitlisted enrollment.
 */
export async function createEnrollmentCheckout(
  input: PaymentCheckoutRequest,
): Promise<PaymentCheckoutResult> {
  const provider = input.provider ?? defaultProvider();

  if (provider === "none") {
    return {
      status: "deferred",
      provider: "none",
      checkoutUrl: null,
      paymentRef: null,
      message: "Enrollment recorded unpaid — collect payment offline or enable PayPal.",
    };
  }

  const base = appBaseUrl();
  const returnUrl = withEnrollmentId(
    input.returnUrl?.trim() ||
      `${base}/api/public/enrollments/${input.enrollmentId}/payment-status?paid=1`,
    input.enrollmentId,
  );
  const cancelUrl = withEnrollmentId(
    input.cancelUrl?.trim() ||
      `${base}/api/public/enrollments/${input.enrollmentId}/payment-status?cancelled=1`,
    input.enrollmentId,
  );

  if (provider === "paypal") {
    if (!isPayPalConfigured()) {
      if (!allowPayPalStub()) {
        return {
          status: "deferred",
          provider: "paypal",
          checkoutUrl: null,
          paymentRef: null,
          message:
            "PayPal credentials missing — set PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (or PAYPAL_ALLOW_STUB=1 for local).",
        };
      }

      const paymentRef = `paypal_stub_${input.enrollmentId.slice(0, 8)}_${Date.now()}`;
      return {
        status: "pending",
        provider: "paypal",
        checkoutUrl: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}paymentRef=${paymentRef}&stub=1`,
        paymentRef,
        message: "PayPal stub checkout (PAYPAL_ALLOW_STUB=1) — not a live charge.",
      };
    }

    const order = await createPayPalOrder({
      amountCad: input.amountCad,
      enrollmentId: input.enrollmentId,
      sessionId: input.sessionId,
      studentEmail: input.studentEmail,
      description: input.description,
      returnUrl,
      cancelUrl,
    });

    await prisma.paymentEvent
      .create({
        data: {
          enrollmentId: input.enrollmentId,
          provider: "PAYPAL",
          externalTransactionId: order.orderId,
          eventType: "checkout.created",
          payload: {
            amountCad: input.amountCad,
            approveUrl: order.approveUrl,
            sessionId: input.sessionId,
          },
        },
      })
      .catch((error) => {
        const code = (error as { code?: string }).code;
        if (code !== "P2002") throw error;
      });

    return {
      status: "pending",
      provider: "paypal",
      checkoutUrl: order.approveUrl,
      paymentRef: order.orderId,
      message: "PayPal checkout created — redirect the student to checkoutUrl.",
    };
  }

  // Stripe reserved for later — keep stub unless credentials land.
  const paymentRef = `stripe_${input.enrollmentId.slice(0, 8)}_${Date.now()}`;
  return {
    status: "pending",
    provider: "stripe",
    checkoutUrl: `${base}/api/webhooks/stripe?stub=1&ref=${paymentRef}`,
    paymentRef,
    message: "Stripe checkout stub — wire live credentials for production.",
  };
}
