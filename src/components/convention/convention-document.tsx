"use client";

import { useState } from "react";
import {
  ChevronDown,
  Clock,
  HeartHandshake,
  Shirt,
  ShieldAlert,
  Smartphone,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { getConventionContent } from "@/lib/policy/workplace-convention";
import { STUDIO_CULTURE_CONSTITUTION } from "@/lib/culture/values";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, LucideIcon> = {
  phones: Smartphone,
  punctuality: Clock,
  uniform: Shirt,
  focus: Zap,
  "meals-theft": UtensilsCrossed,
  respect: HeartHandshake,
  "substances-privacy": ShieldAlert,
};

function cultureTitle(key: string | undefined, lang: Locale) {
  if (!key) return null;
  const row = STUDIO_CULTURE_CONSTITUTION.find((v) => v.valueKey === key);
  if (!row) return null;
  if (lang === "en") return row.titleEn;
  if (lang === "es") return row.titleEs;
  return row.titleFr;
}

export function ConventionDocument({
  lang,
  dict,
  compact = false,
}: {
  lang: Locale;
  dict: Dictionary;
  compact?: boolean;
}) {
  const content = getConventionContent(lang);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggleSection(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const allOpen = openIds.size === content.sections.length;
  function toggleAll() {
    setOpenIds(allOpen ? new Set() : new Set(content.sections.map((s) => s.id)));
  }

  return (
    <article className={cn("space-y-4 text-sm leading-relaxed", compact && "text-xs")}>
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
          {dict.convention.versionLabel.replace("{version}", content.version)}
        </p>
        <h2 className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-lg")}>
          {content.title}
        </h2>
        <p className="mt-2 text-foreground-muted">{content.preamble}</p>
      </header>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground-muted">
          {dict.convention.principlesTitle}
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground-muted">
          {content.principles.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {!compact && (
        <section className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-accent">
            {dict.convention.goldenRulesTitle}
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {content.goldenRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </section>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground-muted">
          {dict.convention.sectionsTitle}
        </h3>
        <button
          type="button"
          onClick={toggleAll}
          className="shrink-0 text-xs font-medium text-accent hover:underline"
        >
          {allOpen ? dict.convention.collapseAll : dict.convention.expandAll}
        </button>
      </div>

      <div className="space-y-2">
        {content.sections.map((section) => {
          const isOpen = openIds.has(section.id);
          const Icon = SECTION_ICONS[section.id] ?? Smartphone;
          return (
            <section
              key={section.id}
              className="overflow-hidden rounded-xl border border-border bg-surface"
            >
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-muted"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{section.title}</p>
                    {section.cultureValueKey && (
                      <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-medium text-accent">
                        {cultureTitle(section.cultureValueKey, lang)}
                      </span>
                    )}
                  </div>
                  {!isOpen && (
                    <p className="mt-0.5 truncate text-xs text-foreground-muted">
                      {section.goldenRule}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <p className="font-medium text-foreground">{section.goldenRule}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-success">
                          {dict.convention.expectedTitle}
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-foreground-muted">
                          {section.expected.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-danger">
                          {dict.convention.prohibitedTitle}
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-foreground-muted">
                          {section.prohibited.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-foreground-muted">
                      <span className="font-medium">{dict.convention.disciplineTitle}:</span>{" "}
                      {section.disciplineNote}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-xl border border-border bg-surface-muted p-4">
        <h3 className="font-semibold">{dict.convention.ladderTitle}</h3>
        <ol className="mt-3 space-y-3">
          {content.disciplineLadder.map((row, index) => (
            <li key={row.step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                {index}
              </span>
              <div>
                <p className="font-medium">{row.label}</p>
                <p className="text-xs text-foreground-muted">{row.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-danger">{dict.convention.grossTitle}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground-muted">
          {content.grossMisconduct.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-foreground-muted">{content.legalNote}</p>
    </article>
  );
}
