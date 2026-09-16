/**
 * Payment provider abstraction for public enrollments.
 * Credentials resolve from Integration Hub per organization (env fallback).
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getPayPalCredentialsForEnrollment,
  getPayPalCredentialsForSession,
  getStripeCredentialsForEnrollment,
  getStripeCredentialsForSession,
  preferredPublicPaymentProvider,
} from "@/lib/integrations/resolver";
import {
  allowPayPalStub,
  createPayPalOrder,
  isPayPalConfigured,
} from "@/lib/payments/paypal";
import {
  allowStripeStub,
  createStripeCheckoutSession,
  isStripeConfigured,
} from "@/lib/payments/stripe";
import { resolvePublicBookingReturnUrls } from "@/lib/public-api/booking-return";

export type PaymentProvider = "paypal" | "stripe" | "interac" | "cash" | "none";

export type PaymentCheckoutRequest = {
  provider?: PaymentProvider;
  amountCad: number;
  currency?: "CAD";
  enrollmentId: string;
  sessionId: string;
  studentEmail: string;
  studentName?: string;
  courseName?: string;
  description?: string;
  returnUrl?: string | null;
  cancelUrl?: string | null;
  /** Optional — resolved from enrollment/session when omitted. */
  organizationId?: string | null;
  locationId?: string | null;
};

export type PaymentCheckoutResult = {
  status: "pending" | "pending_interac" | "paid" | "deferred" | "error";
  provider: PaymentProvider;
  /** Hosted checkout URL when provider requires redirect (PayPal/Stripe). */
  checkoutUrl: string | null;
  paymentRef: string | null;
  message: string;
  /** Set when status === "error" — BookingModal should show + offer /checkout retry. */
  error?: string;
  retryCheckout?: boolean;
  interacInstructions?: {
    depositEmail: string | null;
    securityQuestion: string | null;
    passwordHint: string | null;
    amountCad: number;
    referenceHint: string;
  };
};

function envDefaultProvider(): PaymentProvider {
  const raw = (process.env.RITMOKIT_PUBLIC_PAYMENT_PROVIDER ?? "none").toLowerCase();
  if (raw === "paypal" || raw === "stripe" || raw === "none") return raw;
  return "none";
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
  const paypalCreds =
    (await getPayPalCredentialsForEnrollment(input.enrollmentId)) ??
    (await getPayPalCredentialsForSession(input.sessionId));
  const stripeCreds =
    (await getStripeCredentialsForEnrollment(input.enrollmentId)) ??
    (await getStripeCredentialsForSession(input.sessionId));

  const hubPreferred = preferredPublicPaymentProvider(
    paypalCreds?.status ?? null,
    stripeCreds?.status ?? null,
  );
  const provider = input.provider ?? (hubPreferred === "none" ? envDefaultProvider() : hubPreferred);

  if (provider === "none") {
    return {
      status: "deferred",
      provider: "none",
      checkoutUrl: null,
      paymentRef: null,
      message: "Enrollment recorded unpaid — collect payment offline or connect PayPal in Integrations.",
    };
  }

  if (provider === "cash") {
    return {
      status: "deferred",
      provider: "cash",
      checkoutUrl: null,
      paymentRef: null,
      message: "Enrollment recorded — collect cash at the studio.",
    };
  }

  if (provider === "interac") {
    const settings = input.locationId
      ? await prisma.locationInteracSettings.findUnique({
          where: { locationId: input.locationId },
        })
      : null;
    const referenceHint = [input.studentName, input.courseName].filter(Boolean).join(", ");
    const paymentRef = `interac_${input.enrollmentId.slice(0, 8)}_${Date.now()}`;
    return {
      status: "pending_interac",
      provider: "interac",
      checkoutUrl: null,
      paymentRef,
      message:
        "Virement Interac en attente — instructions envoyées. Le billet s'active dès confirmation du studio.",
      interacInstructions: {
        depositEmail: settings?.depositEmail ?? process.env.INTERAC_DEPOSIT_EMAIL?.trim() ?? null,
        securityQuestion: settings?.securityQuestion ?? null,
        passwordHint: settings?.passwordHint ?? null,
        amountCad: input.amountCad,
        referenceHint: referenceHint || input.studentEmail,
      },
    };
  }

  const resolved = await resolvePublicBookingReturnUrls({
    enrollmentId: input.enrollmentId,
    locationId: input.locationId,
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
  });
  const returnUrl = withEnrollmentId(resolved.returnUrl, input.enrollmentId);
  const cancelUrl = withEnrollmentId(resolved.cancelUrl, input.enrollmentId);

  if (provider === "paypal") {
    if (!isPayPalConfigured(paypalCreds)) {
      if (!allowPayPalStub()) {
        return {
          status: "error",
          provider: "paypal",
          checkoutUrl: null,
          paymentRef: null,
          error: "paypal_not_connected",
          retryCheckout: true,
          message:
            "PayPal not connected — open Settings → Integrations (or set PAYPAL_* env fallback / PAYPAL_ALLOW_STUB=1 for local).",
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

    try {
      const order = await createPayPalOrder({
        amountCad: input.amountCad,
        enrollmentId: input.enrollmentId,
        sessionId: input.sessionId,
        studentEmail: input.studentEmail,
        description: input.description,
        returnUrl,
        cancelUrl,
        credentials: paypalCreds,
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
              credentialSource: paypalCreds?.source ?? "unknown",
              organizationId: paypalCreds?.organizationId ?? null,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "paypal_order_failed";
      console.error("[payments] paypal checkout error", message);
      return {
        status: "error",
        provider: "paypal",
        checkoutUrl: null,
        paymentRef: null,
        error: message.startsWith("paypal_") ? message : "paypal_order_failed",
        retryCheckout: true,
        message: "PayPal checkout failed — retry via POST /api/public/enrollments/:id/checkout.",
      };
    }
  }

  if (!isStripeConfigured(stripeCreds)) {
    if (!allowStripeStub()) {
      return {
        status: "error",
        provider: "stripe",
        checkoutUrl: null,
        paymentRef: null,
        error: "stripe_not_connected",
        retryCheckout: true,
        message:
          "Stripe not connected — open Settings → Integrations (or set STRIPE_SECRET_KEY / STRIPE_ALLOW_STUB=1 for local).",
      };
    }

    const paymentRef = `stripe_stub_${input.enrollmentId.slice(0, 8)}_${Date.now()}`;
    return {
      status: "pending",
      provider: "stripe",
      checkoutUrl: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}paymentRef=${paymentRef}&stub=1`,
      paymentRef,
      message: "Stripe stub checkout (STRIPE_ALLOW_STUB=1) — not a live charge.",
    };
  }

  try {
    const session = await createStripeCheckoutSession({
      amountCad: input.amountCad,
      enrollmentId: input.enrollmentId,
      sessionId: input.sessionId,
      studentEmail: input.studentEmail,
      description: input.description,
      returnUrl,
      cancelUrl,
      credentials: stripeCreds,
    });

    await prisma.paymentEvent
      .create({
        data: {
          enrollmentId: input.enrollmentId,
          provider: "STRIPE",
          externalTransactionId: session.sessionId,
          eventType: "checkout.created",
          payload: {
            amountCad: input.amountCad,
            checkoutUrl: session.checkoutUrl,
            sessionId: input.sessionId,
            credentialSource: stripeCreds?.source ?? "unknown",
            organizationId: stripeCreds?.organizationId ?? null,
          },
        },
      })
      .catch((error) => {
        const code = (error as { code?: string }).code;
        if (code !== "P2002") throw error;
      });

    return {
      status: "pending",
      provider: "stripe",
      checkoutUrl: session.checkoutUrl,
      paymentRef: session.sessionId,
      message: "Stripe checkout created — redirect the student to checkoutUrl.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "stripe_checkout_failed";
    console.error("[payments] stripe checkout error", message);
    return {
      status: "error",
      provider: "stripe",
      checkoutUrl: null,
      paymentRef: null,
      error: message.startsWith("stripe_") ? message : "stripe_checkout_failed",
      retryCheckout: true,
      message: "Stripe checkout failed — retry via POST /api/public/enrollments/:id/checkout.",
    };
  }
}
