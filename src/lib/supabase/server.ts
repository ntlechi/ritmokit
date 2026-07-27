import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv, getSupabaseServiceRoleEnv } from "@/lib/supabase/env";

/**
 * Server-side Supabase client (Server Components, Server Actions,
 * Route Handlers). Reads/writes the auth session via cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — the session refresh
            // is handled by proxy.ts instead. Safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for trusted server-only contexts (webhook route,
 * agent workers). Bypasses Row Level Security — never expose to the client.
 */
export function createServiceRoleClient() {
  const { url, serviceRoleKey } = getSupabaseServiceRoleEnv();

  return createServerClient(
    url,
    serviceRoleKey,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    },
  );
}
