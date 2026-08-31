"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/client";

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function asOtpType(value: string | null): EmailOtpType | null {
  if (value && (OTP_TYPES as string[]).includes(value)) {
    return value as EmailOtpType;
  }
  return null;
}

function safeNext(next: string | null, lang: Locale) {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return `/${lang}`;
}

/**
 * Invite emails from `inviteUserByEmail` do not start PKCE. They land as
 * `token_hash` + `type`, or as `#access_token=`. The old route only accepted
 * `?code=`, so the first click always failed.
 */
export function AuthCallbackClient({
  lang,
  workingLabel,
}: {
  lang: Locale;
  workingLabel: string;
}) {
  const router = useRouter();

  useEffect(() => {
    async function complete() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get("next"), lang);

      if (url.searchParams.get("error")) {
        router.replace(`/${lang}/login?error=magicLinkFailed`);
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          router.replace(next);
          router.refresh();
          return;
        }
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace(next);
          router.refresh();
          return;
        }
      }

      const tokenHash = url.searchParams.get("token_hash");
      const type = asOtpType(url.searchParams.get("type"));
      if (tokenHash) {
        const attempts: EmailOtpType[] = type ? [type] : ["invite", "magiclink", "email"];
        for (const otpType of attempts) {
          const { error } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash: tokenHash,
          });
          if (!error) {
            router.replace(next);
            router.refresh();
            return;
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }

      router.replace(`/${lang}/login?error=magicLinkFailed`);
    }

    void complete();
  }, [lang, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-foreground-muted" aria-live="polite">
        {workingLabel}
      </p>
    </div>
  );
}
