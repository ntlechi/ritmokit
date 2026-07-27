import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale, defaultLocale } from "@/lib/i18n/config";

/**
 * PKCE landing page for the magic-link flow (`requestMagicLinkAction`).
 * Supabase redirects here with `?code=...`; we exchange it for a session
 * (setting the auth cookies via `lib/supabase/server.ts`) then continue on
 * to `next`. Must stay reachable without a session — see `proxy.ts`'s
 * `isPublicRoute`.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await context.params;
  const lang = isLocale(rawLang) ? rawLang : defaultLocale;

  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? `/${lang}`;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/${lang}/login?error=magicLinkFailed`);
}
