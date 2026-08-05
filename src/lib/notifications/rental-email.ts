/**
 * Thin email adapter for room rental notifications (mirrors enrollment email).
 */
import "server-only";

export type RentalEmailKind =
  | "b2b_pending_staff"
  | "b2b_approved"
  | "b2b_rejected"
  | "rental_confirmed"
  | "interac_pending_staff";

export async function sendRentalEmail(input: {
  to: string;
  kind: RentalEmailKind;
  subject: string;
  text: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!input.to?.trim()) {
    console.info("[email:rental:skip-no-to]", { kind: input.kind, meta: input.meta });
    return { sent: false, reason: "missing_recipient" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "locations@ritmokit.com";

  if (!apiKey) {
    console.info("[email:rental:stub]", {
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
      console.error("[email:rental] resend failed", res.status, body.slice(0, 400));
      return { sent: false, reason: "resend_failed" };
    }

    return { sent: true };
  } catch (error) {
    console.error("[email:rental] send error", error);
    return { sent: false, reason: "send_error" };
  }
}
