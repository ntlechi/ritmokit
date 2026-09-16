/**
 * Stripe Checkout + webhook verification for public enrollments.
 * Credentials come from Integration Hub (preferred) or platform STRIPE_* env.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { StripeIntegrationConfig } from "@/lib/integrations/types";

export type StripeCredentials = StripeIntegrationConfig;

export type StripeCheckoutResult = {
  sessionId: string;
  checkoutUrl: string;
};

export function envStripeCredentials(): StripeCredentials | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  const mode =
    secretKey.startsWith("sk_live_") || process.env.STRIPE_MODE === "live"
      ? "live"
      : "test";
  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    mode,
  };
}

export function isStripeConfigured(creds?: StripeCredentials | null): boolean {
  if (creds) return Boolean(creds.secretKey?.trim());
  return Boolean(envStripeCredentials());
}

export function allowStripeStub(): boolean {
  return process.env.STRIPE_ALLOW_STUB === "1";
}

function requireCreds(creds?: StripeCredentials | null): StripeCredentials {
  const resolved = creds ?? envStripeCredentials();
  if (!resolved?.secretKey?.trim()) throw new Error("stripe_not_configured");
  return resolved;
}

async function stripeForm(
  creds: StripeCredentials,
  path: string,
  body?: URLSearchParams,
): Promise<Response> {
  return fetch(`https://api.stripe.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${creds.secretKey.trim()}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ?? undefined,
    cache: "no-store",
  });
}

export async function testStripeConnection(
  creds: StripeCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await stripeForm(creds, "/v1/balance");
    if (!res.ok) {
      const body = await res.text();
      console.error("[stripe] test failed", res.status, body.slice(0, 400));
      return { ok: false, error: "stripe_auth_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "stripe_auth_failed" };
  }
}

export async function createStripeCheckoutSession(input: {
  amountCad: number;
  enrollmentId: string;
  sessionId: string;
  studentEmail: string;
  description?: string;
  returnUrl: string;
  cancelUrl: string;
  credentials?: StripeCredentials | null;
}): Promise<StripeCheckoutResult> {
  const creds = requireCreds(input.credentials);
  const cents = Math.round(input.amountCad * 100);
  if (!Number.isFinite(cents) || cents < 50) {
    throw new Error("stripe_invalid_amount");
  }

  const body = new URLSearchParams({
    mode: "payment",
    success_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.enrollmentId,
    customer_email: input.studentEmail,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "cad",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": (
      input.description ?? "RitmoKit inscription"
    ).slice(0, 120),
    "metadata[enrollmentId]": input.enrollmentId,
    "metadata[sessionId]": input.sessionId,
    "payment_intent_data[metadata][enrollmentId]": input.enrollmentId,
  });

  const res = await stripeForm(creds, "/v1/checkout/sessions", body);
  const raw = (await res.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!res.ok || !raw.id || !raw.url) {
    console.error("[stripe] checkout failed", res.status, raw.error?.message ?? raw);
    throw new Error("stripe_checkout_failed");
  }

  return { sessionId: raw.id, checkoutUrl: raw.url };
}

export function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string;
  webhookSecret: string;
}): boolean {
  const secret = input.webhookSecret.trim();
  if (!secret) return false;

  const items = input.signatureHeader.split(",").map((part) => part.trim());
  const timestamp = items.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = items
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${input.payload}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  return signatures.some((sig) => {
    try {
      const got = Buffer.from(sig, "hex");
      return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
    } catch {
      return false;
    }
  });
}

export function extractStripeCheckoutRefs(event: {
  type?: string;
  data?: { object?: Record<string, unknown> };
}): {
  eventType: string;
  sessionId: string | null;
  enrollmentId: string | null;
  amountCad: number | null;
  paid: boolean;
} {
  const eventType = event.type ?? "unknown";
  const obj = event.data?.object ?? {};
  const metadata = (obj.metadata ?? {}) as { enrollmentId?: string };
  const amountTotal =
    typeof obj.amount_total === "number" ? obj.amount_total : null;
  const paymentStatus = typeof obj.payment_status === "string" ? obj.payment_status : "";

  return {
    eventType,
    sessionId: typeof obj.id === "string" ? obj.id : null,
    enrollmentId: metadata.enrollmentId ?? (typeof obj.client_reference_id === "string" ? obj.client_reference_id : null),
    amountCad: amountTotal != null ? amountTotal / 100 : null,
    paid: paymentStatus === "paid" || eventType === "checkout.session.completed",
  };
}
