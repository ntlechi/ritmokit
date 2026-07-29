"use client";

import { useMemo, useState } from "react";
import { stationRailStyle } from "@/lib/calendar/style";
import {
  HEATMAP_HOURS,
  buildFinancialSnapshots,
  resolveHeatmapTone,
  type HourFinancialSnapshot,
  type StationHourCoverage,
} from "@/lib/scheduling/coverage-client";
import { stationLabel, type StationRecord } from "@/lib/stations/display";
import { dna } from "@/lib/design/dna";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const toneStyles: Record<string, string> = {
  closed: "bg-surface-muted/60 text-foreground-muted",
  understaffed: "bg-danger/15 ring-1 ring-inset ring-danger/20",
  overstaffed: "bg-warning/15 ring-1 ring-inset ring-warning/20",
  ok: "bg-success/15 ring-1 ring-inset ring-success/15",
  critical: "bg-danger/30 ring-1 ring-inset ring-danger/45",
};

function formatCurrency(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(amount);
}

function HeatmapCell({
  coverage,
  financial,
  stationLabelText,
  dict,
  locale,
}: {
  coverage: StationHourCoverage;
  financial: HourFinancialSnapshot | undefined;
  stationLabelText: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const [hovered, setHovered] = useState(false);
  const tone = resolveHeatmapTone(coverage, financial);

  const tooltip =
    coverage.status === "closed"
      ? dict.schedule.closedHour
      : dict.schedule.tooltip
          .replace("{required}", String(coverage.requiredHeadcount))
          .replace("{station}", stationLabelText)
          .replace("{scheduled}", String(coverage.scheduledHeadcount))
          .replace(
            "{revenuePerHour}",
            financial?.revenuePerHour != null ? formatCurrency(financial.revenuePerHour, locale) : "—",
          );

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div
        className={cn(
          "h-7 rounded-lg transition-colors",
          toneStyles[tone],
          coverage.gap !== 0 && coverage.status !== "closed" && "cursor-help",
        )}
        title={tooltip}
        tabIndex={coverage.status !== "closed" ? 0 : undefined}
        aria-label={tooltip}
      />
      {hovered && coverage.status !== "closed" && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
          <p className="font-medium">{stationLabelText} · {String(coverage.hour).padStart(2, "0")}:00</p>
          <p className="mt-1 text-foreground-muted">
            {dict.schedule.need}: {coverage.requiredHeadcount} · {dict.schedule.planned}: {coverage.scheduledHeadcount}
          </p>
          {financial && (
            <p className="mt-0.5 text-foreground-muted">
              {dict.schedule.revenuePerHour}: {financial.revenuePerHour != null ? formatCurrency(financial.revenuePerHour, locale) : "—"}
              {financial.isCritical && (
                <span className="ml-1 font-medium text-orange-600">· {dict.schedule.laborCostCritical}</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CoverageHeatmap({
  hourly,
  laborBuckets,
  stations,
  locale,
  dict,
}: {
  hourly: StationHourCoverage[];
  laborBuckets: Array<{
    hour: number;
    projectedClassRevenue: number;
    actualClassRevenue: number | null;
    laborHours: number;
    laborCost: number;
  }>;
  stations: StationRecord[];
  locale: Locale;
  dict: Dictionary;
}) {
  const financialByHour = useMemo(() => {
    const rows = buildFinancialSnapshots(laborBuckets);
    return new Map(rows.map((row) => [row.hour, row]));
  }, [laborBuckets]);

  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);

  const stationIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of hourly) set.add(row.stationId);
    return [...set];
  }, [hourly]);

  const coverageByKey = useMemo(() => {
    const map = new Map<string, StationHourCoverage>();
    for (const row of hourly) map.set(`${row.stationId}::${row.hour}`, row);
    return map;
  }, [hourly]);

  return (
    <section className={cn("flex flex-col gap-3 p-4", dna.panel)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{dict.schedule.heatmapTitle}</h3>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger/50" aria-hidden />
            {dict.schedule.legendUnderstaffed}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success/50" aria-hidden />
            {dict.schedule.legendOk}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning/50" aria-hidden />
            {dict.schedule.legendOverstaffed}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
            {dict.schedule.legendCritical}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid min-w-[640px] gap-1"
          style={{ gridTemplateColumns: `88px repeat(${HEATMAP_HOURS.length}, minmax(28px, 1fr))` }}
        >
          <div className="text-[10px] font-medium uppercase text-foreground-muted" />
          {HEATMAP_HOURS.map((hour) => (
            <div key={hour} className="text-center text-[10px] tabular-nums text-foreground-muted">
              {hour}h
            </div>
          ))}

          {stationIds.map((stationId) => {
            const station = stationById.get(stationId);
            const label = station ? stationLabel(station, locale) : stationId;
            return (
              <div key={stationId} className="contents">
                <div
                  className="flex items-center border-l-[3px] pl-2 text-xs font-medium"
                  style={station ? stationRailStyle(station.colorHex) : undefined}
                >
                  {label}
                </div>
                {HEATMAP_HOURS.map((hour) => {
                  const coverage = coverageByKey.get(`${stationId}::${hour}`);
                  if (!coverage) return <div key={hour} className="h-8" />;
                  return (
                    <HeatmapCell
                      key={hour}
                      coverage={coverage}
                      financial={financialByHour.get(hour)}
                      stationLabelText={label}
                      dict={dict}
                      locale={locale}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
