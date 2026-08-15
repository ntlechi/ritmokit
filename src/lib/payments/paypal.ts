/**
 * PayPal Orders v2 + webhook verification for public enrollments (Phase A1b).
 * Credentials come from Integration Hub (preferred) or platform env fallback.
 */
import "server-only";

import type { PayPalIntegrationConfig } from "@/lib/integrations/types";
import { buildPayPalInvoiceId } from "@/lib/payments/paypal-invoice-id";

export { buildPayPalInvoiceId } from "@/lib/payments/paypal-invoice-id";

export type PayPalMode = "sandbox" | "live";

export type PayPalCredentials = PayPalIntegrationConfig;

export type PayPalOrderResult = {
  orderId: string;
  approveUrl: string;
};

export function paypalApiBase(mode: PayPalMode): string {
  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function envPayPalCredentials(): PayPalCredentials | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const mode =
    (process.env.PAYPAL_MODE ?? "sandbox").toLowerCase() === "live"
      ? "live"
      : "sandbox";
  return {
    clientId,
    clientSecret,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() ?? "",
    mode,
  };
}

export function isPayPalConfigured(creds?: PayPalCredentials | null): boolean {
  if (creds) return Boolean(creds.clientId && creds.clientSecret);
  return Boolean(envPayPalCredentials());
}

export function allowPayPalStub(): boolean {
  return process.env.PAYPAL_ALLOW_STUB === "1";
}

type TokenCache = { key: string; accessToken: string; expiresAt: number };
const tokenCaches = new Map<string, TokenCache>();

function cacheKey(creds: PayPalCredentials): string {
  return `${creds.mode}:${creds.clientId}`;
}

export async function getPayPalAccessToken(creds: PayPalCredentials): Promise<string> {
  const clientId = creds.clientId.trim();
  const clientSecret = creds.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new Error("paypal_not_configured");
  }

  const key = cacheKey(creds);
  const now = Date.now();
  const cached = tokenCaches.get(key);
  if (cached && cached.expiresAt > now + 30_000) {
    return cached.accessToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalApiBase(creds.mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[paypal] token error", res.status, body.slice(0, 400));
    throw new Error("paypal_token_failed");
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCaches.set(key, {
    key,
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  });
  return data.access_token;
}

/** Smoke-test credentials without creating an order. */
export async function testPayPalConnection(
  creds: PayPalCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getPayPalAccessToken(creds);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "paypal_token_failed";
    return { ok: false, error: message };
  }
}

function formatCad(amount: number): string {
  return amount.toFixed(2);
}

function pickApproveUrl(links: Array<{ rel?: string; href?: string }> | undefined): string | null {
  const approve = links?.find((l) => l.rel === "approve" || l.rel === "payer-action");
  return approve?.href ?? null;
}

function requireCreds(creds?: PayPalCredentials | null): PayPalCredentials {
  const resolved = creds ?? envPayPalCredentials();
  if (!resolved) throw new Error("paypal_not_configured");
  return resolved;
}

export async function createPayPalOrder(input: {
  amountCad: number;
  enrollmentId: string;
  sessionId: string;
  studentEmail: string;
  description?: string;
  returnUrl: string;
  cancelUrl: string;
  credentials?: PayPalCredentials | null;
  /** Optional override for tests; defaults to time+random nonce. */
  invoiceNonce?: string;
}): Promise<PayPalOrderResult> {
  const creds = requireCreds(input.credentials);
  const token = await getPayPalAccessToken(creds);
  const value = formatCad(input.amountCad);
  const invoiceId = buildPayPalInvoiceId(input.enrollmentId, input.invoiceNonce);

  const res = await fetch(`${paypalApiBase(creds.mode)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.sessionId.slice(0, 36),
          custom_id: input.enrollmentId,
          invoice_id: invoiceId,
          description: (input.description ?? "RitmoKit inscription").slice(0, 127),
          amount: {
            currency_code: "CAD",
            value,
          },
        },
      ],
      application_context: {
        brand_name: "RitmoKit",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
      payer: {
        email_address: input.studentEmail,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[paypal] create order failed", res.status, body.slice(0, 600));
    throw new Error("paypal_order_failed");
  }

  const order = (await res.json()) as {
    id: string;
    links?: Array<{ rel?: string; href?: string }>;
  };

  const approveUrl = pickApproveUrl(order.links);
  if (!approveUrl) {
    throw new Error("paypal_missing_approve_url");
  }

  return { orderId: order.id, approveUrl };
}

export async function capturePayPalOrder(
  orderId: string,
  credentials?: PayPalCredentials | null,
): Promise<{
  captureId: string | null;
  status: string;
  enrollmentId: string | null;
  amountCad: number | null;
  raw: unknown;
}> {
  const creds = requireCreds(credentials);
  const token = await getPayPalAccessToken(creds);
  const res = await fetch(`${paypalApiBase(creds.mode)}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: "{}",
    cache: "no-store",
  });

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const name = (raw as { name?: string }).name;
    if (name === "ORDER_ALREADY_CAPTURED") {
      return getPayPalOrder(orderId, creds);
    }
    console.error("[paypal] capture failed", res.status, JSON.stringify(raw).slice(0, 600));
    throw new Error("paypal_capture_failed");
  }

  return parseOrderPayload(raw);
}

/** True when PayPal order/capture is safely settled for marking enrollment PAID. */
export function isPayPalCaptureComplete(order: {
  status: string;
  captureId: string | null;
}): boolean {
  const status = order.status.toUpperCase();
  return status === "COMPLETED" || (status === "APPROVED" && Boolean(order.captureId));
}

export async function getPayPalOrder(
  orderId: string,
  credentials?: PayPalCredentials | null,
): Promise<{
  captureId: string | null;
  status: string;
  enrollmentId: string | null;
  amountCad: number | null;
  raw: unknown;
}> {
  const creds = requireCreds(credentials);
  const token = await getPayPalAccessToken(creds);
  const res = await fetch(`${paypalApiBase(creds.mode)}/v2/checkout/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[paypal] get order failed", res.status, JSON.stringify(raw).slice(0, 400));
    throw new Error("paypal_get_order_failed");
  }
  return parseOrderPayload(raw);
}

function parseOrderPayload(raw: unknown): {
  captureId: string | null;
  status: string;
  enrollmentId: string | null;
  amountCad: number | null;
  raw: unknown;
} {
  const order = raw as {
    id?: string;
    status?: string;
    purchase_units?: Array<{
      custom_id?: string;
      amount?: { value?: string };
      payments?: {
        captures?: Array<{ id?: string; status?: string; amount?: { value?: string } }>;
      };
    }>;
  };

  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amountStr = capture?.amount?.value ?? unit?.amount?.value ?? null;

  return {
    captureId: capture?.id ?? null,
    status: order.status ?? "UNKNOWN",
    enrollmentId: unit?.custom_id ?? null,
    amountCad: amountStr != null ? Number(amountStr) : null,
    raw,
  };
}

export type PayPalWebhookHeaders = {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
};

/**
 * Verify webhook authenticity with PayPal for a specific merchant.
 * Stub skip only when PAYPAL_ALLOW_STUB=1 and no webhookId on credentials.
 */
export async function verifyPayPalWebhook(input: {
  headers: PayPalWebhookHeaders;
  webhookEvent: unknown;
  credentials?: PayPalCredentials | null;
}): Promise<boolean> {
  const creds = input.credentials ?? envPayPalCredentials();
  const webhookId = creds?.webhookId?.trim();

  if (!webhookId) {
    if (allowPayPalStub()) {
      console.warn("[paypal] webhook verify skipped (PAYPAL_ALLOW_STUB=1, no WEBHOOK_ID)");
      return true;
    }
    console.error("[paypal] PAYPAL_WEBHOOK_ID missing — rejecting webhook");
    return false;
  }

  if (!creds || !isPayPalConfigured(creds)) return false;

  const token = await getPayPalAccessToken(creds);
  const res = await fetch(
    `${paypalApiBase(creds.mode)}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: input.headers.authAlgo,
        cert_url: input.headers.certUrl,
        transmission_id: input.headers.transmissionId,
        transmission_sig: input.headers.transmissionSig,
        transmission_time: input.headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: input.webhookEvent,
      }),
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("[paypal] verify webhook failed", res.status, body.slice(0, 400));
    return false;
  }

  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}

/** Pull enrollment id + order id from common PayPal webhook shapes. */
export function extractPayPalWebhookRefs(event: {
  event_type?: string;
  resource?: Record<string, unknown>;
}): { eventType: string; orderId: string | null; enrollmentId: string | null; captureId: string | null } {
  const eventType = event.event_type ?? "unknown";
  const resource = event.resource ?? {};

  let orderId: string | null = null;
  let enrollmentId: string | null = null;
  let captureId: string | null = null;

  if (typeof resource.id === "string") {
    if (eventType.startsWith("PAYMENT.CAPTURE")) {
      captureId = resource.id;
    } else {
      orderId = resource.id;
    }
  }

  const supplementary = resource.supplementary_data as
    | { related_ids?: { order_id?: string } }
    | undefined;
  if (!orderId && supplementary?.related_ids?.order_id) {
    orderId = supplementary.related_ids.order_id;
  }

  const units = resource.purchase_units as Array<{ custom_id?: string }> | undefined;
  if (units?.[0]?.custom_id) {
    enrollmentId = units[0].custom_id;
  }

  if (!enrollmentId && typeof resource.custom_id === "string") {
    enrollmentId = resource.custom_id;
  }

  return { eventType, orderId, enrollmentId, captureId };
}
