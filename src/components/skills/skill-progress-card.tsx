"use client";

import Link from "next/link";
import { Award, ChevronRight, GraduationCap } from "lucide-react";
import type { EmployeeSkillProgress } from "@/lib/data/skills";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

function levelTone(level: EmployeeSkillProgress["currentLevel"]): "neutral" | "accent" | "warning" {
  if (level === "LEAD") return "warning";
  if (level === "AUTONOME") return "accent";
  return "neutral";
}

export function SkillProgressCard({
  progress,
  dict,
  lang,
}: {
  progress: EmployeeSkillProgress;
  dict: Dictionary;
  lang: Locale;
}) {
  const nextLabel = progress.nextLevel
    ? dict.manager.skills.levels[progress.nextLevel]
    : null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent">
          <Award className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{dict.skills.progressTitle}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {progress.primaryStation
              ? stationLabel(progress.primaryStation, lang)
              : "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={levelTone(progress.currentLevel)}>
              {dict.manager.skills.levels[progress.currentLevel]}
            </Badge>
            {nextLabel && (
              <span className="text-xs text-foreground-muted">
                → {dict.skills.nextLevel.replace("{level}", nextLabel)}
              </span>
            )}
          </div>

          {progress.nextLevel && progress.missingModules.length > 0 && (
            <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                {dict.skills.unlockHint}
              </p>
              <ul className="mt-1.5 space-y-1">
                {progress.missingModules.slice(0, 3).map((mod) => (
                  <li key={mod.id} className="text-xs text-foreground">
                    · {mod.title}
                  </li>
                ))}
              </ul>
              <Link
                href={`/${lang}/sops`}
                className={cn(
                  "mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline",
                )}
              >
                {dict.skills.openTraining}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}

          {progress.nextLevel == null && (
            <p className="mt-2 text-xs text-success">{dict.skills.maxLevel}</p>
          )}
        </div>
      </div>
    </section>
  );
}
