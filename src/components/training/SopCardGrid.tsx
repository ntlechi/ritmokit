import Link from "next/link";
import {
  BookOpen,
  Check,
  Lock,
  PlayCircle,
  Shield,
  UtensilsCrossed,
  Layers,
} from "lucide-react";
import type { FormationCatalog, FormationModuleSummary } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { moduleIconTone, modulePastel, resolveLockedLabel } from "@/lib/training/lms-ui";
import { cn } from "@/lib/utils";

const kindIcon = {
  SAFETY: Shield,
  SOP: BookOpen,
  RECIPE: UtensilsCrossed,
  ONBOARDING: Layers,
} as const;

function CourseCard({
  module,
  lang,
  dict,
  trackLabel,
  isFeatured,
}: {
  module: FormationModuleSummary;
  lang: Locale;
  dict: Dictionary;
  trackLabel: string;
  isFeatured?: boolean;
}) {
  const Icon = kindIcon[module.kind] ?? BookOpen;
  const locked = !module.unlocked;
  const completed = module.status === "COMPLETED";
  const inProgress = Boolean(isFeatured && !completed && !locked);
  const lockedText = resolveLockedLabel(dict, module.lockedLabel);

  const inner = (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border shadow-xs transition",
        locked
          ? "border-zinc-200/80 bg-zinc-50 opacity-80 dark:border-white/10 dark:bg-zinc-900/40"
          : completed
            ? "border-emerald-500/25 bg-white dark:bg-zinc-900/60"
            : inProgress
              ? "border-red-500/35 bg-white ring-1 ring-red-500/15 dark:bg-zinc-900/60"
              : "border-zinc-200/80 bg-white hover:-translate-y-0.5 hover:shadow-sm dark:border-white/10 dark:bg-zinc-900/60",
      )}
    >
      <div className={cn("relative flex h-28 items-center justify-center", modulePastel(module.kind))}>
        <span
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl shadow-xs",
            moduleIconTone(module.kind),
          )}
        >
          {locked ? <Lock className="h-6 w-6" aria-hidden /> : <Icon className="h-6 w-6" aria-hidden />}
        </span>
        {completed && (
          <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          {module.isMandatory && (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
              {dict.training.mandatory}
            </span>
          )}
          {module.kind === "SAFETY" && (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
              {dict.training.cnesstBadge}
            </span>
          )}
          {module.videoUrl && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground-muted dark:border-white/10 dark:bg-white/5">
              <PlayCircle className="h-3 w-3" aria-hidden />
              {dict.training.videoBadge}
            </span>
          )}
          {completed && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {dict.training.completed}
            </span>
          )}
        </div>

        <h3 className="text-sm font-semibold tracking-tight">{module.title}</h3>
        <p className="text-[11px] text-foreground-muted">
          {trackLabel}
          {module.estimatedMinutes != null && (
            <>
              {" · "}
              <span className="metric">{module.estimatedMinutes}</span> {dict.training.minutes}
            </>
          )}
        </p>

        {locked && lockedText ? (
          <p className="mt-auto flex items-center gap-1.5 pt-2 text-[11px] font-medium text-foreground-muted">
            <Lock className="h-3 w-3" aria-hidden />
            {lockedText}
          </p>
        ) : inProgress ? (
          <p className="mt-auto pt-2 text-[11px] font-semibold text-red-600 dark:text-red-300">
            {dict.training.inProgress}
            {module.stepCount > 0 &&
              ` · ${dict.training.stepCount.replace("{count}", String(module.stepCount))}`}
          </p>
        ) : (
          <p className="mt-auto pt-2 text-[11px] text-foreground-muted">
            {dict.training.kind[module.kind]}
          </p>
        )}
      </div>
    </article>
  );

  if (locked) return <div className="h-full">{inner}</div>;

  return (
    <Link href={`/${lang}/sops/${module.id}`} className="block h-full">
      {inner}
    </Link>
  );
}

export function SopCardGrid({
  catalog,
  lang,
  dict,
  filterStationId,
}: {
  catalog: FormationCatalog;
  lang: Locale;
  dict: Dictionary;
  /** When set, only show that section; otherwise show all. */
  filterStationId?: string | null | "all";
}) {
  const sections =
    filterStationId === "all" || filterStationId === undefined
      ? catalog.sections
      : catalog.sections.filter((s) => s.stationId === filterStationId);

  const cards = sections.flatMap((section) => {
    const trackLabel =
      section.stationId == null
        ? dict.training.sectionGeneral
        : (() => {
            const station = catalog.stations.find((s) => s.id === section.stationId);
            return station ? stationLabel(station, lang) : dict.training.sectionGeneral;
          })();
    return section.modules.map((module) => ({ module, trackLabel }));
  });

  if (cards.length === 0) {
    return (
      <p className="rounded-2xl border border-zinc-200/80 bg-zinc-50 px-6 py-10 text-center text-sm text-foreground-muted dark:border-white/10 dark:bg-zinc-900/40">
        {dict.training.emptyModules}
      </p>
    );
  }

  const core = cards.filter((c) => c.module.stationId == null);
  const stationCards = cards.filter((c) => c.module.stationId != null);
  const primaryId = catalog.primaryStationId;
  const primary = stationCards.filter((c) => c.module.stationId === primaryId);
  const others = stationCards.filter((c) => c.module.stationId !== primaryId);
  // Polyvalence: primary station first, then core, then other stations
  const ordered = [...primary, ...core, ...others];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ordered.map(({ module, trackLabel }) => (
        <CourseCard
          key={module.id}
          module={module}
          lang={lang}
          dict={dict}
          trackLabel={trackLabel}
          isFeatured={module.id === catalog.resumeModule?.id}
        />
      ))}
    </div>
  );
}
