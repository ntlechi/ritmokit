/** Pure Interac status / ticket helpers (no DB). */

export function ticketCodeForEnrollment(enrollmentId: string): string {
  return `RK|${enrollmentId}`;
}

export function parseTicketCode(ticket: string): string | null {
  const raw = ticket.trim();
  if (!raw) return null;
  const rk = raw.match(/^RK\|([0-9a-f-]{36})$/i);
  if (rk) return rk[1]!;
  const sa = raw.match(/^SA\|(.+)$/i);
  if (sa) {
    const id = sa[1]!.trim();
    if (/^[0-9a-f-]{36}$/i.test(id)) return id;
    if (id.startsWith("enr_")) {
      const rest = id.slice(4);
      if (/^[0-9a-f-]{36}$/i.test(rest)) return rest;
    }
  }
  if (/^[0-9a-f-]{36}$/i.test(raw)) return raw;
  return null;
}

export function publicPaymentStatus(status: string, provider?: string | null): string {
  if (status === "PENDING" && (provider === "PAYPAL" || provider === "STRIPE")) {
    return "pending_paypal";
  }
  return status.toLowerCase();
}

export function amountToCents(amountCad: number | null | undefined): number {
  if (amountCad == null || !Number.isFinite(amountCad)) return 0;
  return Math.round(amountCad * 100);
}

/** Door / QR rule from payment status. */
export function doorStatusFromPayment(input: {
  waitlisted: boolean;
  paid: boolean;
  paymentStatus: string;
}): "ALLOW" | "UNPAID" | "CANCELLED" | "WAITLIST" {
  if (input.waitlisted) return "WAITLIST";
  if (input.paymentStatus === "CANCELLED_INTERAC") return "CANCELLED";
  if (input.paid && input.paymentStatus === "PAID") return "ALLOW";
  return "UNPAID";
}
