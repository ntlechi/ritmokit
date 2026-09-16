import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getStripeCredentialsForEnrollment,
  listStripeWebhookCandidates,
} from "@/lib/integrations/resolver";
import { markEnrollmentPaid } from "@/lib/payments/mark-enrollment-paid";
import {
  allowStripeStub,
  extractStripeCheckoutRefs,
  verifyStripeWebhookSignature,
} from "@/lib/payments/stripe";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/stripe
 * checkout.session.completed → mark enrollment PAID (per-org hub secret).
 */
export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";

  let event: {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };

  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const refs = extractStripeCheckoutRefs(event);
  const candidates = refs.enrollmentId
    ? [
        await getStripeCredentialsForEnrollment(refs.enrollmentId),
        ...(await listStripeWebhookCandidates()),
      ]
    : await listStripeWebhookCandidates();

  const seen = new Set<string>();
  let verified = false;
  for (const candidate of candidates) {
    const secret = candidate?.webhookSecret?.trim();
    if (!secret || seen.has(secret)) continue;
    seen.add(secret);
    if (verifyStripeWebhookSignature({ payload, signatureHeader: signature, webhookSecret: secret })) {
      verified = true;
      break;
    }
  }

  if (!verified) {
    if (allowStripeStub() && !signature) {
      verified = true;
    } else {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  const actionable =
    refs.eventType === "checkout.session.completed" ||
    refs.eventType === "checkout.session.async_payment_succeeded";

  if (!actionable) {
    return NextResponse.json({ ok: true, ignored: refs.eventType });
  }

  if (!refs.enrollmentId || !refs.paid) {
    return NextResponse.json({ error: "missing_enrollment" }, { status: 422 });
  }

  try {
    const result = await markEnrollmentPaid({
      enrollmentId: refs.enrollmentId,
      provider: "STRIPE",
      externalTransactionId: refs.sessionId ?? event.id ?? `stripe_${Date.now()}`,
      eventType: refs.eventType,
      payload: event,
      amountCad: refs.amountCad,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      alreadyProcessed: result.alreadyProcessed,
      promoted: result.promoted,
      enrollmentId: refs.enrollmentId,
    });
  } catch (error) {
    console.error("[webhooks:stripe]", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
