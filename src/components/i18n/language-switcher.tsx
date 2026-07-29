"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ lang }: { lang: Locale }) {
  const pathname = usePathname();

  function hrefFor(target: Locale) {
    if (!pathname) return `/${target}`;
    const segments = pathname.split("/");
    if (segments.length > 1) segments[1] = target;
    return segments.join("/") || `/${target}`;
  }

  return (
    <div className={cn(dna.pillTrack, "shadow-xs")}>
      {(["fr", "en", "es"] as Locale[]).map((code) => (
        <Link
          key={code}
          href={hrefFor(code)}
          data-interactive
          aria-current={lang === code ? "page" : undefined}
          className={cn(
            "rounded-full px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide",
            lang === code ? dna.pillActive : dna.pillIdle,
          )}
        >
          {code}
        </Link>
      ))}
    </div>
  );
}
