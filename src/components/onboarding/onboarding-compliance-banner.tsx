"use client";

import Link from "next/link";
import { AlertTriangle, UserCheck } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

export function OnboardingComplianceBanner({
  lang,
  dict,
}: {
  lang: Locale;
  dict: Dictionary;
}) {
  return (
    <section className="rounded-2xl border border-warning/40 bg-warning/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{dict.onboarding.punchBlockTitle}</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">{dict.onboarding.punchBlockSubtitle}</p>
        </div>
      </div>
      <Link
        href={`/${lang}/onboarding`}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        <UserCheck className="h-4 w-4" aria-hidden />
        {dict.onboarding.punchBlockCta}
      </Link>
    </section>
  );
}
