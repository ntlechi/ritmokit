/**
 * Payment provider abstraction for public enrollments.
 * Salsa Attitude pilot → PayPal; RitmoKit SaaS billing stays on Stripe separately.
 * Do not hardcode PayPal globally — switch via env / studio config later.
 */

export type PaymentProvider = "paypal" | "stripe" | "none";

export type PaymentCheckoutRequest = {
  provider?: PaymentProvider;
  amountCad: number;
  currency?: "CAD";
  enrollmentId: string;
  sessionId: string;
  studentEmail: string;
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

/**
 * Create a checkout intent. Until PayPal credentials are wired, returns a
 * deferred/pending stub so enrollments can proceed with `paid: false`.
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

  // Stub hooks — replace with real PayPal/Stripe SDK calls.
  const paymentRef = `${provider}_${input.enrollmentId.slice(0, 8)}_${Date.now()}`;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  if (provider === "paypal") {
    return {
      status: "pending",
      provider: "paypal",
      checkoutUrl: input.returnUrl
        ? `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}paymentRef=${paymentRef}`
        : `${base}/api/public/webhooks/paypal?stub=1&ref=${paymentRef}`,
      paymentRef,
      message: "PayPal checkout stub — wire live credentials for production.",
    };
  }

  return {
    status: "pending",
    provider: "stripe",
    checkoutUrl: `${base}/api/public/webhooks/stripe?stub=1&ref=${paymentRef}`,
    paymentRef,
    message: "Stripe checkout stub — wire live credentials for production.",
  };
}
