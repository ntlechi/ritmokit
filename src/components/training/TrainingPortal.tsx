import Link from "next/link";
import { Settings2 } from "lucide-react";
import { SopCardGrid } from "@/components/training/SopCardGrid";
import { SopCatalogHero } from "@/components/training/SopCatalogHero";
import { SopCategorySidebar } from "@/components/training/SopCategorySidebar";
import { SopDocumentsStrip } from "@/components/training/SopDocumentsStrip";
import type { FormationCatalog } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

/**
 * Server Component shell — only SopCategorySidebar is a client island.
 * Hero / card grid / documents stay RSC to keep the SOP page JS small.
 */
export function TrainingPortal({
  catalog,
  lang,
  dict,
  canManage = false,
  hidePageTitle = false,
}: {
  catalog: FormationCatalog;
  lang: Locale;
  dict: Dictionary;
  canManage?: boolean;
  /** When the route already painted a title chrome above Suspense. */
  hidePageTitle?: boolean;
}) {
  const core = catalog.sections.find((s) => s.stationId === null);
  const corePct =
    core && core.modules.length > 0
      ? Math.round((core.completedCount / core.modules.length) * 100)
      : 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:gap-6">
      <SopCategorySidebar catalog={catalog} lang={lang} dict={dict} />

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {!hidePageTitle ? (
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{dict.training.title}</h1>
              <p className="mt-1 text-sm text-foreground-muted">{dict.training.subtitle}</p>
            </div>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {core && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                <span className="metric">
                  {core.completedCount}/{core.modules.length}
                </span>
                <span className="text-foreground-muted">· {dict.training.sectionGeneral}</span>
                <span className="metric text-foreground-muted">{corePct}%</span>
              </span>
            )}
            {canManage && (
              <Link
                href={`/${lang}/settings/training`}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-white/5"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden />
                {dict.training.manageCatalog}
              </Link>
            )}
          </div>
        </div>

        <SopCatalogHero catalog={catalog} lang={lang} dict={dict} />
        <SopCardGrid catalog={catalog} lang={lang} dict={dict} />
        <SopDocumentsStrip catalog={catalog} lang={lang} dict={dict} />
      </div>
    </div>
  );
}
