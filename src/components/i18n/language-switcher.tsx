"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";
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
    <div className="inline-flex rounded-full border border-zinc-200/80 bg-zinc-100/80 p-1 shadow-xs dark:border-white/10 dark:bg-white/5">
      {(["fr", "en", "es"] as Locale[]).map((code) => (
        <Link
          key={code}
          href={hrefFor(code)}
          data-interactive
          aria-current={lang === code ? "page" : undefined}
          className={cn(
            "rounded-full px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide",
            lang === code
              ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
              : "text-foreground-muted hover:text-foreground",
          )}
        >
          {code}
        </Link>
      ))}
    </div>
  );
}
