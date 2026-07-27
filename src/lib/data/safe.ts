import "server-only";

/**
 * Wraps a Prisma call so a missing/unreachable `DATABASE_URL` degrades
 * to an empty state instead of a 500 — useful before Supabase is wired
 * up, and resilient in production if the pool briefly drops.
 */
export async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; dbError: boolean }> {
  try {
    const data = await fn();
    return { data, dbError: false };
  } catch (error) {
    console.error("[mirok:db]", error);
    return { data: fallback, dbError: true };
  }
}
