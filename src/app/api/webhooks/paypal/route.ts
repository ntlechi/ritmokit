import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { markEnrollmentPaid } from "@/lib/payments/mark-enrollment-paid";
import {
  capturePayPalOrder,
  extractPayPalWebhookRefs,
  getPayPalOrder,
  isPayPalCaptureComplete,
  verifyPayPalWebhook,
} from "@/lib/payments/paypal";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/paypal
 * Idempotent PayPal listener — verify → capture (if needed) → mark PAID → promote waitlist.
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

  const verified = await verifyPayPalWebhook({
    headers,
    webhookEvent: event,
  });
  if (!verified) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const refs = extractPayPalWebhookRefs(event);
  const eventType = refs.eventType;

  // Ignore noise; acknowledge so PayPal stops retrying.
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
      const captured = await capturePayPalOrder(orderId);
      enrollmentId = enrollmentId ?? captured.enrollmentId;
      captureId = captured.captureId ?? captureId;
      amountCad = captured.amountCad;
      orderStatus = captured.status;
      if (!orderId) orderId = refs.orderId;
    } else if (orderId) {
      const order = await getPayPalOrder(orderId);
      enrollmentId = enrollmentId ?? order.enrollmentId;
      captureId = order.captureId ?? captureId;
      amountCad = order.amountCad;
      orderStatus = order.status;
    } else if (eventType === "PAYMENT.CAPTURE.COMPLETED" && captureId) {
      // Capture-only event — treat as settled when we have a capture id.
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
