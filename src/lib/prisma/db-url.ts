/**
 * Normalizes Supabase pooler URL for Vercel serverless (transaction mode, port 6543).
 * Avoids the URL() parser — Postgres DSNs break it when passwords contain special chars.
 */
export function sanitizeDatabaseUrl(raw: string | undefined): string {
  if (!raw) return "";

  let cleaned = raw
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  // Strip wrapping quotes (common when pasting from .env into Vercel).
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Collapse accidental whitespace / newlines from Vercel paste.
  cleaned = cleaned.replace(/\s+/g, "");

  return cleaned;
}

export function describeDatabaseUrl(raw: string | undefined) {
  const cleaned = sanitizeDatabaseUrl(raw);
  const schemeMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  return {
    length: cleaned.length,
    scheme: schemeMatch?.[1] ?? null,
    startsWithPostgres: /^postgres(ql)?:\/\//i.test(cleaned),
    has6543: /:6543(\/|\?|$)/.test(cleaned),
    has5432: /:5432(\/|\?|$)/.test(cleaned),
    hasPgbouncer: /([?&])pgbouncer=true/.test(cleaned),
    looksLikeHostOnly: Boolean(cleaned && !cleaned.includes("://") && cleaned.includes("pooler.supabase")),
  };
}

export function getRuntimeDatabaseUrl(): string {
  const cleaned = sanitizeDatabaseUrl(process.env.DATABASE_URL);
  if (!cleaned) {
    throw new Error("Missing DATABASE_URL");
  }

  if (!/^postgres(ql)?:\/\//i.test(cleaned)) {
    const hint = describeDatabaseUrl(cleaned);
    throw new Error(
      `DATABASE_URL must start with postgresql:// (got scheme=${hint.scheme ?? "none"}, length=${hint.length})`,
    );
  }

  // Prefer 6543, but don't hard-fail on 5432 — Vercel serverless can still
  // query via session pooler; we just force pgbouncer-friendly params.
  let result = cleaned;
  if (!/([?&])pgbouncer=/.test(result)) {
    result += result.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
  }
  if (!/([?&])connection_limit=/.test(result)) {
    result += result.includes("?") ? "&connection_limit=1" : "?connection_limit=1";
  }

  return result;
}
