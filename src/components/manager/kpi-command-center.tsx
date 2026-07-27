import { BarChart3 } from "lucide-react";
import { KpiMetricCard } from "@/components/kpi/kpi-metric-card";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { LocationKpiSnapshot } from "@/lib/kpi/types";

export function KpiCommandCenter({
  snapshot,
  dict,
  lang,
}: {
  snapshot: LocationKpiSnapshot;
  dict: Dictionary;
  lang: Locale;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-accent" aria-hidden />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.kpi.badge}
          </p>
          <h2 className="text-sm font-semibold">{dict.kpi.title}</h2>
        </div>
      </div>
      <p className="mt-1 text-xs text-foreground-muted">{dict.kpi.subtitle}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.metrics.map((metric) => (
          <KpiMetricCard key={metric.key} metric={metric} dict={dict} lang={lang} />
        ))}
      </div>

      {snapshot.hasPosLive && (
        <p className="mt-3 text-[10px] text-success">{dict.kpi.posLiveNote}</p>
      )}
    </section>
  );
}
