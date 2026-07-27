import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Supabase SSR client scoped to the Edge middleware (`proxy.ts`). Distinct
 * from `lib/supabase/server.ts` (which reads/writes cookies via
 * `next/headers`, only available in Server Components/Actions) because
 * middleware operates directly on the in-flight `NextRequest`/`NextResponse`
 * cookie jars instead.
 *
 * `supabase.auth.getUser()` always revalidates against the Supabase Auth
 * server (unlike `getSession()`, which only decodes the local cookie), so
 * this doubles as the session-refresh step Supabase recommends running on
 * every request.
 */
export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const { url, anonKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  return { supabase, getResponse: () => response };
}
