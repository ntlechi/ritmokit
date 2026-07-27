"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n/config";

/**
 * Discriminated result shared across auth actions — same shape as the rest
 * of the app's server actions (see lib/actions/{shifts,chat}.ts). `error` is
 * a stable code (not a translated string) so the client picks the right
 * copy from `dict.auth.errors` regardless of locale.
 */
export type AuthActionResult = { ok: true } | { ok: false; error: string };

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "invalidCredentials";
  if (m.includes("email not confirmed")) return "emailNotConfirmed";
  if (m.includes("rate limit")) return "rateLimited";
  return "genericError";
}

async function resolveOrigin(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function loginWithPasswordAction(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim();
  if (!email || !input.password) return { ok: false, error: "missingFields" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });
    if (error) return { ok: false, error: mapAuthError(error.message) };
    return { ok: true };
  } catch (err) {
    console.error("[auth] loginWithPasswordAction", err);
    if (err instanceof Error && err.message === "configError") {
      return { ok: false, error: "configError" };
    }
    return { ok: false, error: "genericError" };
  }
}

/**
 * Passwordless sign-in: emails a one-time link that lands on
 * `/[lang]/auth/callback`, which exchanges the code for a session (PKCE)
 * and redirects to `next`. Origin is derived from request headers rather
 * than trusted client input.
 */
export async function requestMagicLinkAction(input: {
  email: string;
  lang: string;
  next?: string;
}): Promise<AuthActionResult> {
  const email = input.email.trim();
  if (!email) return { ok: false, error: "missingFields" };

  const lang: Locale = isLocale(input.lang) ? input.lang : defaultLocale;
  const origin = await resolveOrigin();
  const redirectTo = new URL(`/${lang}/auth/callback`, origin);
  if (input.next) redirectTo.searchParams.set("next", input.next);

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo.toString() },
    });
    if (error) return { ok: false, error: mapAuthError(error.message) };
    return { ok: true };
  } catch (err) {
    console.error("[auth] requestMagicLinkAction", err);
    if (err instanceof Error && err.message === "configError") {
      return { ok: false, error: "configError" };
    }
    return { ok: false, error: "genericError" };
  }
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
