"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ClassEconomicsRow } from "@/lib/dance/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

function money(value: number, lang: Locale) {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-ES" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Bottom 10% by gross margin — rose alert chips for quick schedule decisions. */
export function MarginAlerts({
  rows,
  lang,
  dict,
}: {
  rows: ClassEconomicsRow[];
  lang: Locale;
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;
  const bottom = useMemo(() => {
    if (rows.length === 0) return [];
    const byProfit = [...rows].sort((a, b) => a.grossMargin - b.grossMargin);
    const cut = Math.max(1, Math.ceil(byProfit.length * 0.1));
    return byProfit.slice(0, cut);
  }, [rows]);

  if (bottom.length === 0) return null;

  return (
    <section className="rounded-2xl border border-margin-alert/35 bg-margin-alert/5 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-margin-alert" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{c.marginAlerts.title}</h2>
            <p className="text-xs text-foreground-muted">{c.marginAlerts.subtitle}</p>
          </div>
        </div>
        <Link
          href={`/${lang}/sessions`}
          className="text-xs font-medium text-accent hover:underline"
        >
          {c.marginAlerts.cta}
        </Link>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {bottom.map((row) => (
          <li
            key={row.sessionId}
            className={cn(
              "rounded-xl border border-margin-alert/25 bg-surface px-3 py-2.5",
              row.grossMargin < 0 && "bg-margin-alert/8",
            )}
          >
            <p className="truncate text-sm font-medium">{row.courseTitle}</p>
            <p className="mt-0.5 text-[11px] text-foreground-muted">
              {row.style} · {row.roomName}
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-margin-alert">
                {c.marginAlerts.badge}
              </span>
              <span
                className={cn(
                  "metric text-sm font-bold tabular-nums",
                  row.grossMargin < 0 ? "text-margin-alert" : "text-foreground",
                )}
              >
                {money(row.grossMargin, lang)}
              </span>
            </div>
            {row.roomYieldPerSqm != null && (
              <p className="mt-1 text-[11px] text-foreground-muted">
                {money(row.roomYieldPerSqm, lang)}/m²
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
