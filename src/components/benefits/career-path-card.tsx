"use client";

import Link from "next/link";
import { Award, ChevronRight, GraduationCap, Route } from "lucide-react";
import type { EmployeeCareerPath } from "@/lib/data/benefits";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";

function levelTone(level: EmployeeCareerPath["currentLevel"]): "neutral" | "accent" | "warning" {
  if (level === "LEAD") return "warning";
  if (level === "AUTONOME") return "accent";
  return "neutral";
}

export function CareerPathCard({
  path,
  dict,
  lang,
}: {
  path: EmployeeCareerPath;
  dict: Dictionary;
  lang: Locale;
}) {
  const progressPct =
    path.totalMandatoryCount > 0
      ? Math.round((path.completedMandatoryCount / path.totalMandatoryCount) * 100)
      : 100;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent">
          <Route className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{dict.benefits.careerTitle}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {path.primaryStation
              ? `${path.primaryStation.nameFr}`
              : "—"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={levelTone(path.currentLevel)}>
              {dict.manager.skills.levels[path.currentLevel]}
            </Badge>
            {path.nextLevel ? (
              <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
                → <Award className="h-3 w-3" aria-hidden />
                {dict.benefits.careerNext.replace(
                  "{level}",
                  dict.manager.skills.levels[path.nextLevel],
                )}
              </span>
            ) : (
              <span className="text-xs text-success">{dict.benefits.careerMax}</span>
            )}
          </div>

          {path.totalMandatoryCount > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] text-foreground-muted">
                <span>{dict.benefits.careerProgress}</span>
                <span>
                  {path.completedMandatoryCount}/{path.totalMandatoryCount} ({progressPct}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {path.nextLevel && path.missingModules.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                {dict.benefits.careerGap}
              </p>
              <ul className="mt-1.5 space-y-1">
                {path.missingModules.slice(0, 4).map((mod) => (
                  <li key={mod.id} className="text-xs text-foreground">
                    · {mod.title}
                    {mod.arsiId && (
                      <span className="ml-1 text-[10px] text-foreground-muted">
                        (#{mod.arsiId})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                href={`/${lang}/sops`}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                {dict.benefits.openTraining}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
