"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Circle,
  FileWarning,
  Lock,
  Play,
} from "lucide-react";
import type { FormationCatalog, FormationCatalogSection, FormationModuleSummary } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { resolveLockedLabel } from "@/lib/training/lms-ui";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";
import Link from "next/link";

function sectionTitle(
  section: FormationCatalogSection,
  catalog: FormationCatalog,
  lang: Locale,
  dict: Dictionary,
) {
  if (!section.stationId) return dict.training.sectionGeneral;
  const station = catalog.stations.find((s) => s.id === section.stationId);
  return station ? `SOP ${stationLabel(station, lang)}` : dict.training.sectionGeneral;
}

function LessonStatusIcon({
  module,
  activeId,
}: {
  module: FormationModuleSummary;
  activeId?: string | null;
}) {
  if (!module.unlocked) return <Lock className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />;
  if (module.status === "COMPLETED") return <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  if (module.id === activeId) return <Play className="h-3.5 w-3.5 text-red-500" aria-hidden />;
  return <Circle className="h-3.5 w-3.5 text-foreground-muted/40" aria-hidden />;
}

function CategoryBlock({
  section,
  catalog,
  lang,
  dict,
  defaultOpen,
  activeModuleId,
}: {
  section: FormationCatalogSection;
  catalog: FormationCatalog;
  lang: Locale;
  dict: Dictionary;
  defaultOpen: boolean;
  activeModuleId?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const title = sectionTitle(section, catalog, lang, dict);
  const isPrimary =
    section.stationId !== null && section.stationId === catalog.primaryStationId;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-muted"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-foreground-muted transition-transform",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        {isPrimary && (
          <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground-muted">
            {dict.training.yourStation}
          </span>
        )}
        <span className="metric text-[11px] text-foreground-muted">
          {section.completedCount}/{section.modules.length}
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <ul className="overflow-hidden pb-2">
          {section.modules.map((module) => {
            const locked = resolveLockedLabel(dict, module.lockedLabel);
            const active = module.id === activeModuleId;
            const content = (
              <>
                <LessonStatusIcon module={module} activeId={activeModuleId} />
                <span className="min-w-0 flex-1 truncate">{module.title}</span>
              </>
            );
            return (
              <li key={module.id}>
                {module.unlocked ? (
                  <Link
                    href={`/${lang}/sops/${module.id}`}
                    className={cn(
                      "mx-2 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs transition",
                      active
                        ? "bg-red-500/10 font-semibold text-red-700 dark:text-red-300"
                        : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className="mx-2 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-foreground-muted opacity-70"
                    title={locked ?? undefined}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function SopCategorySidebar({
  catalog,
  lang,
  dict,
  activeModuleId,
}: {
  catalog: FormationCatalog;
  lang: Locale;
  dict: Dictionary;
  activeModuleId?: string | null;
}) {
  const journeyDay = Math.max(1, Math.min(5, catalog.seniorityDays + 1));
  const docs = catalog.sections
    .flatMap((s) => s.modules)
    .filter((m) => m.requiresSignature);
  const docsPending = docs.filter((m) => m.status !== "COMPLETED").length;

  return (
    <aside className={cn("flex w-full flex-col lg:w-72 lg:shrink-0 xl:w-80", dna.panel)}>
      <div className="border-b border-border px-4 py-4">
        <h2 className="text-base font-bold tracking-tight">{dict.training.centerTitle}</h2>
        <p className="mt-1 text-[11px] text-foreground-muted">{dict.training.polyvalenceHint}</p>
      </div>

      <div className="mx-3 mt-3 rounded-2xl bg-accent p-4 text-accent-foreground">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-foreground/70">
            {dict.training.yourPath}
          </p>
          <span className="rounded-full bg-accent-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            {dict.training.journeyDay.replace("{day}", String(journeyDay))}
          </span>
        </div>
        <p className="metric mt-2 text-lg font-semibold">
          {dict.training.lessonsCompleted
            .replace("{done}", String(catalog.completedLessons))
            .replace("{total}", String(catalog.totalLessons))}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent-foreground/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width]"
            style={{
              width: `${
                catalog.totalLessons > 0
                  ? Math.round((catalog.completedLessons / catalog.totalLessons) * 100)
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto" aria-label={dict.training.centerTitle}>
        {catalog.sections.map((section) => {
          const isPrimary =
            section.stationId !== null && section.stationId === catalog.primaryStationId;
          const defaultOpen =
            isPrimary ||
            section.stationId === null ||
            section.modules.some((m) => m.id === activeModuleId);
          return (
            <CategoryBlock
              key={section.stationId ?? "general"}
              section={section}
              catalog={catalog}
              lang={lang}
              dict={dict}
              defaultOpen={defaultOpen}
              activeModuleId={activeModuleId}
            />
          );
        })}
      </nav>

      {docs.length > 0 && (
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold text-foreground">{dict.training.importantDocs}</p>
            {docsPending > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                <FileWarning className="h-3 w-3" aria-hidden />
                {dict.training.toSign}
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
