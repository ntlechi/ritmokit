"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { CalendarRange, DoorOpen, LayoutDashboard } from "lucide-react";
import { ParityRadar } from "@/components/dashboard/dance/parity-radar";
import { ProfitMatrix } from "@/components/dashboard/dance/profit-matrix";
import { ProgressionFunnel } from "@/components/dashboard/dance/progression-funnel";
import { RoomHeatmap } from "@/components/dashboard/dance/room-heatmap";
import { StudioPulse } from "@/components/dashboard/dance/studio-pulse";
import type { StudioCockpitData } from "@/lib/data/studio-cockpit";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const KpiCommandCenter = dynamic(
  () => import("@/components/manager/kpi-command-center").then((m) => m.KpiCommandCenter),
  {
    loading: () => (
      <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" aria-hidden />
    ),
  },
);

export function StudioCockpit({
  lang,
  data,
  dict,
}: {
  lang: Locale;
  data: StudioCockpitData;
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;
  const { analytics, kpiSnapshot } = data;

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
            {c.badge}
          </p>
          <h1 className="display-title mt-1 text-2xl font-bold tracking-tight">{c.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
            {c.subtitle.replace("{location}", data.locationName)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${lang}/sessions`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
          >
            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
            {c.tools.sessions}
          </Link>
          <Link
            href={`/${lang}/rooms`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
          >
            <DoorOpen className="h-3.5 w-3.5" aria-hidden />
            {c.tools.rooms}
          </Link>
          <Link
            href={`/${lang}/settings/manager`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
          >
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
            {c.tools.settings}
          </Link>
        </div>
      </header>

      <StudioPulse analytics={analytics} lang={lang} dict={dict} />

      <KpiCommandCenter snapshot={kpiSnapshot} dict={dict} lang={lang} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ParityRadar
          parity={analytics.parity}
          blockedRevenue={analytics.aggregates.blockedRevenue}
          lang={lang}
          dict={dict}
        />
        <ProfitMatrix rows={analytics.classRows} lang={lang} dict={dict} />
        <RoomHeatmap cells={analytics.heatmap} lang={lang} dict={dict} />
        <ProgressionFunnel
          progression={analytics.progression}
          churnRiskStudents={analytics.churnRiskStudents}
          dict={dict}
        />
      </div>

      {analytics.aggregates.classCount === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center">
          <p className="text-sm font-medium">{c.emptyTitle}</p>
          <p className="mt-1 text-sm text-foreground-muted">{c.emptyHint}</p>
          <Link
            href={`/${lang}/sessions`}
            className="mt-4 inline-flex rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-foreground"
          >
            {c.emptyCta}
          </Link>
        </div>
      )}
    </div>
  );
}
