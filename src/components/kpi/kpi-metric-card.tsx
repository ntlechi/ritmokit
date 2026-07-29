"use client";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { KpiMetric } from "@/lib/kpi/types";
import { KpiExplainer } from "@/components/kpi/kpi-explainer";
import { Meter, type ChartTone } from "@/components/charts/primitives";
import { cn } from "@/lib/utils";

function formatValue(metric: KpiMetric, lang: Locale): string {
  if (metric.value == null) return "—";
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "seconds") return `${Math.round(metric.value)}s`;
  if (metric.unit === "count") return String(Math.round(metric.value));
  if (metric.unit === "ratio") return metric.value.toFixed(1);
  if (metric.unit === "currency") {
    return new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-ES" : "fr-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: metric.value >= 100 ? 0 : 2,
    }).format(metric.value);
  }
  return String(metric.value);
}

function healthTone(health: KpiMetric["health"]): string {
  if (health === "good") return "border-success/30 bg-success/5";
  if (health === "warning") return "border-warning/30 bg-warning/5";
  if (health === "critical") return "border-danger/30 bg-danger/5";
  return "border-border bg-surface";
}

function meterTone(health: KpiMetric["health"]): ChartTone {
  if (health === "good") return "success";
  if (health === "warning") return "warning";
  if (health === "critical") return "danger";
  return "muted";
}

/**
 * Scale a metric onto a 0-100 track so every card shares one visual language.
 * Percentages map directly; other units are read against their target band.
 */
function meterScale(metric: KpiMetric): { value: number; max: number; target?: number } | null {
  if (metric.value == null) return null;
  if (metric.unit === "percent") {
    return { value: metric.value, max: 100, target: metric.targetMin ?? metric.targetMax };
  }
  const target = metric.targetMin ?? metric.targetMax;
  if (target == null || target <= 0) return null;
  const max = Math.max(metric.value, target) * 1.25;
  return { value: metric.value, max, target };
}

function availabilityBadge(
  availability: KpiMetric["availability"],
  dict: Dictionary,
): { label: string; tone: string } | null {
  if (availability === "live") return { label: dict.kpi.availability.live, tone: "bg-success/10 text-success" };
  if (availability === "partial")
    return { label: dict.kpi.availability.partial, tone: "bg-warning/10 text-warning" };
  return { label: dict.kpi.availability.pending, tone: "bg-surface-muted text-foreground-muted" };
}

export function KpiMetricCard({
  metric,
  dict,
  lang,
  compact = false,
}: {
  metric: KpiMetric;
  dict: Dictionary;
  lang: Locale;
  compact?: boolean;
}) {
  const meta = dict.kpi.metrics[metric.key];
  const badge = availabilityBadge(metric.availability, dict);
  const scale = meterScale(metric);

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-zinc-900/60",
        healthTone(metric.health),
        compact && "p-3",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {meta.shortLabel}
            </p>
            <KpiExplainer kpiKey={metric.key} dict={dict} />
          </div>
          {!compact && <p className="mt-0.5 text-[10px] text-foreground-muted">{meta.hint}</p>}
        </div>
        {badge && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              badge.tone,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <p className={cn("metric mt-2 font-bold text-foreground", compact ? "text-xl" : "text-2xl")}>
        {formatValue(metric, lang)}
      </p>

      {scale && (
        <Meter
          className="mt-2"
          value={scale.value}
          max={scale.max}
          target={scale.target}
          tone={meterTone(metric.health)}
          caption={`${meta.shortLabel}: ${formatValue(metric, lang)}`}
        />
      )}

      {metric.channelBreakdown && metric.channelBreakdown.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-border-subtle pt-2">
          {metric.channelBreakdown.map((row) => (
            <li key={row.channel} className="flex justify-between text-[10px] text-foreground-muted">
              <span>{dict.kpi.channels[row.channel]}</span>
              <span className="tabular-nums font-medium text-foreground">
                {formatValue({ ...metric, value: row.avgTicket, unit: "currency" }, lang)}
                <span className="ml-1 font-normal text-foreground-muted">({row.orderCount})</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {metric.sampleSize != null && metric.sampleSize > 0 && (
        <p className="mt-1 text-[10px] text-foreground-muted">
          {dict.kpi.sampleSize.replace("{count}", String(metric.sampleSize))}
        </p>
      )}
    </article>
  );
}
