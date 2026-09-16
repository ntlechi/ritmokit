/** Pure origin helpers for redirect-target whitelisting (no env, no DB). */

export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Exact-origin whitelist check for a client-supplied redirect target.
 * Compared by origin, never by prefix, so `https://salsa.qc.evil.tld`
 * does not match `https://salsa.qc`.
 */
export function isAllowedReturnUrl(url: string | null | undefined, allowed: Set<string>): url is string {
  if (!url) return false;
  const origin = originOf(url.trim());
  if (!origin) return false;
  if (allowed.has("*")) return true;
  return allowed.has(origin);
}
