"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import {
  Donut,
  MiniBars,
  paletteColor,
  ProgressRing,
  toneForHigher,
  toneForLower,
} from "@/components/charts/primitives";
import type { DanceAnalyticsBundle } from "@/lib/dance/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import {
  KPI_FLOOR_UTIL_GOOD_MIN,
  KPI_FLOOR_UTIL_WARN_MIN,
  KPI_PARITY_DELTA_GOOD_MAX,
  KPI_PARITY_DELTA_WARN_MAX,
} from "@/lib/kpi/thresholds";

const LEAD_COLOR = "#0EA5E9";
const FOLLOW_COLOR = "#F43F5E";

function money(value: number, lang: Locale) {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-ES" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Visual summary band above the cockpit widgets — the five numbers a studio
 * owner checks first, each paired with a shape so the read is instant.
 */
export function StudioPulse({
  analytics,
  lang,
  dict,
}: {
  analytics: DanceAnalyticsBundle;
  lang: Locale;
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;
  const p = c.pulse;

  const { roleSplit, parityCounts, styleBars, dayBars, totalRevenue } = useMemo(() => {
    let leads = 0;
    let follows = 0;
    const byStyle = new Map<string, number>();
    let revenue = 0;

    for (const row of analytics.classRows) {
      leads += row.leadsFilled;
      follows += row.followsFilled;
      revenue += row.revenue;
      const style = row.style?.trim() || "—";
      byStyle.set(style, (byStyle.get(style) ?? 0) + row.revenue);
    }

    const counts = { balanced: 0, warning: 0, blocked: 0 };
    for (const snapshot of analytics.parity) counts[snapshot.status] += 1;

    const styles = [...byStyle.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value], i) => ({
        label: label.length > 7 ? `${label.slice(0, 6)}.` : label,
        value,
        color: paletteColor(i),
      }));

    const dayLabels = c.heatmap.days;
    const byDay = new Array(7).fill(0) as number[];
    for (const cell of analytics.heatmap) byDay[cell.dayOfWeek] += cell.enrolled;
    const days = byDay.map((value, i) => ({ label: dayLabels[i] ?? String(i), value }));

    return {
      roleSplit: { leads, follows },
      parityCounts: counts,
      styleBars: styles,
      dayBars: days,
      totalRevenue: revenue,
    };
  }, [analytics, c.heatmap.days]);

  const peakDayValue = Math.max(...dayBars.map((d) => d.value), 0);
  const floorUtil = analytics.aggregates.floorUtilizationPct ?? 0;
  const delta = analytics.aggregates.avgLeadFollowDelta ?? 0;
  const totalDancers = roleSplit.leads + roleSplit.follows;

  return (
    <section
      aria-labelledby="studio-pulse-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-accent" aria-hidden />
        <h2 id="studio-pulse-heading" className="text-sm font-semibold">
          {p.title}
        </h2>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Floor utilization */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3">
          <ProgressRing
            value={floorUtil}
            size={62}
            caption={p.floorUtilization}
            tone={toneForHigher(floorUtil, KPI_FLOOR_UTIL_GOOD_MIN, KPI_FLOOR_UTIL_WARN_MIN)}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground-muted">{p.floorUtilization}</p>
            <p className="mt-0.5 text-[11px] text-foreground-muted">
              {p.targetHint.replace("{value}", `${KPI_FLOOR_UTIL_GOOD_MIN}%`)}
            </p>
          </div>
        </div>

        {/* Lead / Follow split */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3">
          <Donut
            segments={[
              { label: c.parity.leads, value: roleSplit.leads, color: LEAD_COLOR },
              { label: c.parity.follows, value: roleSplit.follows, color: FOLLOW_COLOR },
            ]}
            size={62}
            thickness={10}
            centerValue={String(totalDancers)}
            caption={`${p.roleBalance}: ${roleSplit.leads} / ${roleSplit.follows}`}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground-muted">{p.roleBalance}</p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: LEAD_COLOR }} aria-hidden />
                {c.parity.leads} <span className="tabular-nums font-medium">{roleSplit.leads}</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: FOLLOW_COLOR }} aria-hidden />
                {c.parity.follows} <span className="tabular-nums font-medium">{roleSplit.follows}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Parity health */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3">
          <ProgressRing
            value={delta === 0 ? 100 : Math.max(0, 100 - delta * 25)}
            size={62}
            label={`Δ${delta.toFixed(delta % 1 === 0 ? 0 : 1)}`}
            caption={p.parityHealth}
            tone={toneForLower(delta, KPI_PARITY_DELTA_GOOD_MAX, KPI_PARITY_DELTA_WARN_MAX)}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground-muted">{p.parityHealth}</p>
            <ul className="mt-1 space-y-0.5 text-[11px] tabular-nums">
              <li className="text-success">
                {parityCounts.balanced} {c.parity.balanced}
              </li>
              <li className="text-warning">
                {parityCounts.warning} {p.atRisk}
              </li>
              <li className="text-danger">
                {parityCounts.blocked} {p.locked}
              </li>
            </ul>
          </div>
        </div>

        {/* Revenue by style */}
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-foreground-muted">{p.revenueByStyle}</p>
            <p className="metric text-sm font-semibold">{money(totalRevenue, lang)}</p>
          </div>
          {styleBars.length > 0 ? (
            <MiniBars
              className="mt-2"
              height={40}
              bars={styleBars}
              caption={p.revenueByStyle}
            />
          ) : (
            <p className="mt-3 text-[11px] text-foreground-muted">{p.noData}</p>
          )}
        </div>
      </div>

      {/* Weekly load */}
      <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
        <p className="text-xs font-medium text-foreground-muted">{p.weekLoad}</p>
        <MiniBars
          className="mt-2"
          height={56}
          maxBarWidth={72}
          showValues
          bars={dayBars.map((bar) => ({
            ...bar,
            color: bar.value === peakDayValue ? "#6366F1" : "#0EA5E9",
          }))}
          caption={p.weekLoad}
        />
      </div>
    </section>
  );
}
