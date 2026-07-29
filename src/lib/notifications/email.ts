/**
 * Thin email adapter for Phase A.
 * When RESEND_API_KEY is unset, logs and no-ops (never fails the payment webhook).
 */
import "server-only";

export type EnrollmentEmailKind =
  | "payment_confirmed"
  | "waitlist_promoted_pay"
  | "waitlist_promoted_confirmed"
  | "waitlist_promoted_pay_reminder";

export async function sendEnrollmentEmail(input: {
  to: string;
  kind: EnrollmentEmailKind;
  subject: string;
  text: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "inscriptions@ritmokit.com";

  if (!apiKey) {
    console.info("[email:stub]", {
      kind: input.kind,
      to: input.to,
      subject: input.subject,
      meta: input.meta,
    });
    return { sent: false, reason: "resend_not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[email] resend failed", res.status, body.slice(0, 400));
      return { sent: false, reason: "resend_failed" };
    }

    return { sent: true };
  } catch (error) {
    console.error("[email] send error", error);
    return { sent: false, reason: "send_error" };
  }
}
