"use client";

import Link from "next/link";
import { AlertTriangle, BookOpen } from "lucide-react";
import type { TrainingComplianceSnapshot } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

export function TrainingComplianceBanner({
  lang,
  dict,
  compliance,
}: {
  lang: Locale;
  dict: Dictionary;
  compliance: TrainingComplianceSnapshot;
}) {
  if (compliance.isCompliant) return null;

  const count = compliance.missingModules.length;
  const firstModule = compliance.missingModules[0];

  return (
    <section className="rounded-2xl border border-warning/40 bg-warning/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{dict.training.complianceTitle}</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {dict.training.complianceSubtitle.replace(
              "{station}",
              stationLabel(compliance.station, lang),
            )}
          </p>
          <ul className="mt-2 space-y-1">
            {compliance.missingModules.map((module) => (
              <li key={module.id} className="text-xs text-foreground-muted">
                · {module.title}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Link
        href={`/${lang}/sops/${firstModule?.id ?? ""}`}
        className={cn(
          "mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90",
        )}
      >
        <BookOpen className="h-4 w-4" aria-hidden />
        {dict.training.startModule.replace("{count}", String(count))}
      </Link>
    </section>
  );
}
