"use client";

import { ExternalLink, Gift, Heart, PiggyBank, FileText } from "lucide-react";
import type { LocationBenefitRow } from "@/lib/data/benefits";
import type { BenefitType } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function iconFor(type: BenefitType) {
  if (type === "INSURANCE") return Heart;
  if (type === "RETIREMENT") return PiggyBank;
  if (type === "DOCUMENT") return FileText;
  return Gift;
}

export function EmployeeBenefitsCard({
  benefits,
  dict,
}: {
  benefits: LocationBenefitRow[];
  dict: Dictionary;
}) {
  if (benefits.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold">{dict.benefits.employeeTitle}</p>
      <p className="mt-0.5 text-xs text-foreground-muted">{dict.benefits.employeeSubtitle}</p>
      <ul className="mt-3 space-y-2">
        {benefits.map((b) => {
          const Icon = iconFor(b.type);
          return (
            <li
              key={b.id}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{b.title}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                    {dict.benefits.types[b.type]}
                  </p>
                  <p className="mt-1 text-xs text-foreground-muted whitespace-pre-wrap">{b.description}</p>
                  {b.externalUrl && (
                    <a
                      href={b.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                    >
                      {dict.benefits.openLink}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
