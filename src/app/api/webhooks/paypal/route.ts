import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getPayPalCredentialsForEnrollment,
  listPayPalWebhookCandidates,
} from "@/lib/integrations/resolver";
import { markEnrollmentPaid } from "@/lib/payments/mark-enrollment-paid";
import {
  allowPayPalStub,
  capturePayPalOrder,
  extractPayPalWebhookRefs,
  getPayPalOrder,
  isPayPalCaptureComplete,
  type PayPalCredentials,
  verifyPayPalWebhook,
} from "@/lib/payments/paypal";

export const runtime = "nodejs";

type VerifyResult =
  | { ok: true; credentials: PayPalCredentials | null }
  | { ok: false };

async function verifyIncomingWebhook(input: {
  headers: {
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    authAlgo: string;
    transmissionSig: string;
  };
  event: unknown;
  enrollmentId: string | null;
}): Promise<VerifyResult> {
  if (input.enrollmentId) {
    const forEnrollment = await getPayPalCredentialsForEnrollment(input.enrollmentId);
    if (forEnrollment) {
      const ok = await verifyPayPalWebhook({
        headers: input.headers,
        webhookEvent: input.event,
        credentials: forEnrollment,
      });
      if (ok) return { ok: true, credentials: forEnrollment };
    }
  }

  const candidates = await listPayPalWebhookCandidates();
  for (const candidate of candidates) {
    const ok = await verifyPayPalWebhook({
      headers: input.headers,
      webhookEvent: input.event,
      credentials: candidate,
    });
    if (ok) return { ok: true, credentials: candidate };
  }

  if (allowPayPalStub()) {
    const stubOk = await verifyPayPalWebhook({
      headers: input.headers,
      webhookEvent: input.event,
      credentials: null,
    });
    if (stubOk) return { ok: true, credentials: null };
  }

  return { ok: false };
}

/**
 * POST /api/webhooks/paypal
 * Idempotent PayPal listener — verify (per-org hub) → capture → mark PAID → promote waitlist.
 */
export async function POST(request: NextRequest) {
  let event: {
    id?: string;
    event_type?: string;
    resource?: Record<string, unknown>;
  };

  try {
    event = (await request.json()) as typeof event;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const headers = {
    transmissionId: request.headers.get("paypal-transmission-id") ?? "",
    transmissionTime: request.headers.get("paypal-transmission-time") ?? "",
    certUrl: request.headers.get("paypal-cert-url") ?? "",
    authAlgo: request.headers.get("paypal-auth-algo") ?? "",
    transmissionSig: request.headers.get("paypal-transmission-sig") ?? "",
  };

  const refs = extractPayPalWebhookRefs(event);
  const verified = await verifyIncomingWebhook({
    headers,
    event,
    enrollmentId: refs.enrollmentId,
  });

  if (!verified.ok) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const credentials = verified.credentials;
  const eventType = refs.eventType;

  const actionable =
    eventType === "CHECKOUT.ORDER.APPROVED" ||
    eventType === "CHECKOUT.ORDER.COMPLETED" ||
    eventType === "PAYMENT.CAPTURE.COMPLETED";

  if (!actionable) {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  try {
    let orderId = refs.orderId;
    let enrollmentId = refs.enrollmentId;
    let captureId = refs.captureId;
    let amountCad: number | null = null;
    let orderStatus = "";

    if (eventType === "CHECKOUT.ORDER.APPROVED" && orderId) {
      const captured = await capturePayPalOrder(orderId, credentials);
      enrollmentId = enrollmentId ?? captured.enrollmentId;
      captureId = captured.captureId ?? captureId;
      amountCad = captured.amountCad;
      orderStatus = captured.status;
    } else if (orderId) {
      const order = await getPayPalOrder(orderId, credentials);
      enrollmentId = enrollmentId ?? order.enrollmentId;
      captureId = order.captureId ?? captureId;
      amountCad = order.amountCad;
      orderStatus = order.status;
    } else if (eventType === "PAYMENT.CAPTURE.COMPLETED" && captureId) {
      orderStatus = "COMPLETED";
    }

    if (!enrollmentId) {
      console.error("[webhooks:paypal] missing enrollmentId", { eventType, orderId, eventId: event.id });
      return NextResponse.json({ error: "missing_enrollment" }, { status: 422 });
    }

    if (
      !isPayPalCaptureComplete({ status: orderStatus || "UNKNOWN", captureId }) &&
      eventType !== "PAYMENT.CAPTURE.COMPLETED"
    ) {
      console.error("[webhooks:paypal] capture not complete — refusing PAID", {
        eventType,
        orderId,
        orderStatus,
        captureId,
      });
      return NextResponse.json({ error: "capture_incomplete", orderStatus }, { status: 422 });
    }

    const externalId = captureId ?? orderId ?? event.id ?? `paypal_${Date.now()}`;

    const result = await markEnrollmentPaid({
      enrollmentId,
      provider: "PAYPAL",
      externalTransactionId: externalId,
      eventType,
      payload: event,
      amountCad,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      alreadyProcessed: result.alreadyProcessed,
      promoted: result.promoted,
      enrollmentId,
    });
  } catch (error) {
    console.error("[webhooks:paypal]", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
