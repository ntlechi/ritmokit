import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Used by Client Components that need
 * Realtime subscriptions (e.g. the agent bus) or interactive auth.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
