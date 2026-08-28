"use client";

import Link from "next/link";
import { dna } from "@/lib/design/dna";
import type { OwnerPulse } from "@/lib/data/owner-pulse";
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

export function OwnerPulseStrip({
  pulse,
  lang,
  dict,
}: {
  pulse: OwnerPulse;
  lang: Locale;
  dict: Dictionary;
}) {
  const o = dict.studioCockpit.owner;
  const items = [
    {
      href: `/${lang}/students`,
      label: o.collected,
      value: money(pulse.collectedCad + pulse.rentalCollectedCad, lang),
      hint: o.collectedHint,
    },
    {
      href: `/${lang}/interac`,
      label: o.pending,
      value: money(pulse.pendingInteracCad + pulse.rentalPendingCad, lang),
      hint: o.pendingHint,
      warn: pulse.pendingInteracCad + pulse.rentalPendingCad > 0,
    },
    {
      href: `/${lang}/students`,
      label: o.unpaid,
      value: money(pulse.unpaidSeatedCad, lang),
      hint: o.unpaidHint.replace("{count}", String(pulse.unpaidStudentCount)),
      warn: pulse.unpaidSeatedCad > 0,
    },
    {
      href: `/${lang}/students`,
      label: o.students,
      value: String(pulse.studentCount),
      hint: o.studentsHint,
    },
    {
      href: `/${lang}/students`,
      label: o.ready,
      value: String(pulse.readyCount),
      hint: o.readyHint,
    },
    {
      href: `/${lang}/students`,
      label: o.churn,
      value: String(pulse.churnCount),
      hint: o.churnHint,
      warn: pulse.churnCount > 0,
    },
  ];

  return (
    <section aria-labelledby="owner-pulse-title">
      <h2 id="owner-pulse-title" className="sr-only">
        {o.title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            data-interactive
            className={cn(dna.panel, "min-h-11 px-4 py-3 hover:bg-surface-muted")}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {item.label}
            </p>
            <p
              className={cn(
                "mt-1 text-xl font-semibold tabular-nums tracking-tight",
                item.warn && "text-warning",
              )}
            >
              {item.value}
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">{item.hint}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
