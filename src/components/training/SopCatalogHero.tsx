import Link from "next/link";
import { Play } from "lucide-react";
import type { FormationCatalog } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { parseVideoUrl, videoThumbnailUrl } from "@/lib/training/video";
import { cn } from "@/lib/utils";

export function SopCatalogHero({
  catalog,
  lang,
  dict,
}: {
  catalog: FormationCatalog;
  lang: Locale;
  dict: Dictionary;
}) {
  const module = catalog.resumeModule;
  if (!module) return null;

  const track =
    module.stationId == null
      ? dict.training.sectionGeneral
      : (() => {
          const station = catalog.stations.find((s) => s.id === module.stationId);
          return station ? stationLabel(station, lang) : dict.training.sectionGeneral;
        })();

  const videoRef = module.videoUrl ? parseVideoUrl(module.videoUrl) : null;
  const thumb = videoRef ? videoThumbnailUrl(videoRef) : null;
  const totalSteps = Math.max(module.stepCount, 1);
  const currentStep = module.status === "COMPLETED" ? totalSteps : Math.min(2, totalSteps);
  const minutes = module.estimatedMinutes ?? 5;
  const isResume = module.status !== "COMPLETED";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-white shadow-xs">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(239,68,68,0.18),transparent_55%)]" />
      <div className="relative grid gap-5 p-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:p-6">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-zinc-900">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
              <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            {dict.training.resumeWhere.replace("{track}", track)}
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{module.title}</h2>
          {module.summary && (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{module.summary}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {module.isMandatory && (
              <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                {dict.training.mandatory}
              </span>
            )}
            {module.kind === "SAFETY" && (
              <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                {dict.training.cnesstBadge}
              </span>
            )}
            {module.videoUrl && (
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                + {dict.training.videoBadge}
              </span>
            )}
          </div>

          <p className="metric mt-3 text-xs text-zinc-400">
            {dict.training.stepRemaining
              .replace("{current}", String(currentStep))
              .replace("{total}", String(totalSteps))
              .replace("{minutes}", String(minutes))}
          </p>

          <Link
            href={`/${lang}/sops/${module.id}`}
            className={cn(
              "mt-5 inline-flex w-fit items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition active:scale-[0.98]",
              "bg-red-500 text-white hover:bg-red-600",
            )}
          >
            {isResume ? dict.training.resumeCta : dict.training.startCta}
          </Link>
        </div>
      </div>
    </section>
  );
}
