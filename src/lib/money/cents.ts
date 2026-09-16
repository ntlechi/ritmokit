/**
 * Integer-cent money math. Every ledger figure (Decimal(10,2) in Postgres,
 * numbers from the client) is converted to an integer number of cents before
 * it is added, compared or persisted, so `0.1 + 0.2` never reaches a drawer.
 */

/** Parse a Decimal / numeric string / number into integer cents (half-up). */
export function toCents(value: unknown): number {
  if (value == null) return 0;
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    // `1.005 * 100` is 100.4999…; toFixed uses the exact decimal expansion so
    // the string path below rounds the third decimal half-up deterministically.
    text = value.toFixed(4);
  } else {
    text =
      typeof value === "string"
        ? value.trim()
        : typeof value === "object" && typeof (value as { toString?: unknown }).toString === "function"
          ? String(value)
          : "";
  }
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    const n = Number(text);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  const sign = match[1] ? -1 : 1;
  const whole = Number(match[2]);
  const frac = (match[3] ?? "").padEnd(3, "0");
  let cents = Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return sign * (whole * 100 + cents);
}

/** Exact for any integer-cent amount (two decimals). */
export function centsToCad(cents: number): number {
  return cents / 100;
}

export function sumCents(values: Iterable<unknown>): number {
  let total = 0;
  for (const v of values) total += toCents(v);
  return total;
}

/** True when a client-supplied CAD number is a whole number of cents. */
export function isWholeCents(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}
