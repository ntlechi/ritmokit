"use client";

import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { MarginAlerts } from "@/components/dashboard/dance/margin-alerts";
import { ParityRadar } from "@/components/dashboard/dance/parity-radar";
import { ProfitMatrix } from "@/components/dashboard/dance/profit-matrix";
import { ProgressionFunnel } from "@/components/dashboard/dance/progression-funnel";
import { RoomHeatmap } from "@/components/dashboard/dance/room-heatmap";
import { StudioPulse } from "@/components/dashboard/dance/studio-pulse";
import { TonightBoard } from "@/components/dashboard/dance/tonight-board";
import { dna } from "@/lib/design/dna";
import type { StudioCockpitData } from "@/lib/data/studio-cockpit";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

function hasLiveTonight(classRows: StudioCockpitData["analytics"]["classRows"]) {
  const now = new Date();
  const today = now.getDay();
  const windowMs = 3 * 60 * 60 * 1000;
  return classRows.some((row) => {
    const start = new Date(row.startTimeIso);
    const end = new Date(row.endTimeIso);
    const isToday =
      row.dayOfWeek === today ||
      (start.getFullYear() === now.getFullYear() &&
        start.getMonth() === now.getMonth() &&
        start.getDate() === now.getDate());
    if (!isToday) return false;
    const startAt =
      row.dayOfWeek != null
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), start.getHours(), start.getMinutes(), start.getSeconds())
        : start;
    const endAt =
      row.dayOfWeek != null
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), end.getHours(), end.getMinutes(), end.getSeconds())
        : end;
    const msToStart = startAt.getTime() - now.getTime();
    return (msToStart <= windowMs && msToStart >= -60_000) || (now >= startAt && now <= endAt);
  });
}

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
  const { analytics } = data;
  const live = hasLiveTonight(analytics.classRows);

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {c.badge}
            </p>
            {live && (
              <span className={cn(dna.liveBadge)}>
                <span className="live-pulse" aria-hidden />
                {c.liveBadge}
              </span>
            )}
          </div>
          <h1 className="display-title mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {c.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
            {c.subtitle.replace("{location}", data.locationName)}
          </p>
        </div>
        <Link href={`/${lang}/sessions`} className={dna.cta}>
          <CalendarRange className="h-4 w-4" aria-hidden />
          {c.tools.sessions}
        </Link>
      </header>

      <TonightBoard
        classRows={analytics.classRows}
        parity={analytics.parity}
        lang={lang}
        dict={dict}
      />

      <StudioPulse analytics={analytics} lang={lang} dict={dict} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ParityRadar
          parity={analytics.parity}
          blockedRevenue={analytics.aggregates.blockedRevenue}
          lang={lang}
          dict={dict}
        />
        <ProfitMatrix rows={analytics.classRows} lang={lang} dict={dict} />
      </div>

      <MarginAlerts rows={analytics.classRows} lang={lang} dict={dict} />

      <div className="grid gap-4 xl:grid-cols-2">
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
          <Link href={`/${lang}/sessions`} className={cn(dna.cta, "mt-4")}>
            {c.emptyCta}
          </Link>
        </div>
      )}
    </div>
  );
}
