/** Unique per checkout attempt — PayPal rejects reused invoice_id on regenerate. */
export function buildPayPalInvoiceId(enrollmentId: string, attemptNonce?: string): string {
  const compact = enrollmentId.replace(/-/g, "").slice(0, 12);
  const nonce = (attemptNonce ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10);
  // PayPal invoice_id max 127; keep short + unique.
  return `rk_${compact}_${nonce}`.slice(0, 127);
}
