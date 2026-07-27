"use client";

import { useMemo, useState } from "react";
import { fr, enUS, es } from "date-fns/locale";
import { format } from "date-fns";
import { Activity, Check } from "lucide-react";
import type { DayCoverageAlerts } from "@/lib/data/coverage";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { StationRecord } from "@/lib/stations/display";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

type CoverageAlert = DayCoverageAlerts["alerts"][number];

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function alertLabel(
  dict: Dictionary,
  alert: CoverageAlert,
  stations: StationRecord[],
  locale: Locale,
) {
  const station = alert.stationId ? stations.find((s) => s.id === alert.stationId) : null;
  const stationName = station ? stationLabel(station, locale) : "";
  switch (alert.kind) {
    case "understaffed":
      return dict.autoSchedule.alertUnderstaffed.replace("{station}", stationName);
    case "overstaffed":
      return dict.autoSchedule.alertOverstaffed.replace("{station}", stationName);
    case "labor_cost_critical":
      return dict.autoSchedule.alertLaborCostCritical;
    case "splh_low":
      return dict.autoSchedule.alertSplhLow;
  }
}

function isCritical(kind: CoverageAlert["kind"]) {
  return kind === "understaffed" || kind === "labor_cost_critical";
}

/**
 * Couverture de la semaine — bande de 7 jours, détails à la demande.
 * Remplace le mur de badges par une lecture calme : point vert quand la journée
 * est équilibrée, compteur discret sinon, détails au clic.
 */
export function WeeklyCoverageAlerts({
  days,
  stations,
  locale,
  dict,
}: {
  days: DayCoverageAlerts[];
  stations: StationRecord[];
  locale: Locale;
  dict: Dictionary;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const totalAlerts = useMemo(
    () => days.reduce((sum, day) => sum + day.alerts.length, 0),
    [days],
  );

  const selectedDay = selectedDate ? days.find((d) => d.date === selectedDate) : null;
  const dfLocale = dateFnsLocales[locale];

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Activity className="h-4 w-4 text-accent" aria-hidden />
          {dict.autoSchedule.coverageTitle}
        </h3>
        {totalAlerts === 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            {dict.autoSchedule.noAlerts}
          </span>
        ) : (
          <span className="metric text-xs text-foreground-muted">
            {dict.autoSchedule.coverageSummary.replace("{count}", String(totalAlerts))}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const date = new Date(day.date);
          const count = day.alerts.length;
          const hasCritical = day.alerts.some((a) => isCritical(a.kind));
          const selected = selectedDate === day.date;

          return (
            <button
              key={day.date}
              type="button"
              disabled={count === 0}
              onClick={() => setSelectedDate(selected ? null : day.date)}
              aria-pressed={selected}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors",
                selected
                  ? "border-zinc-900/20 bg-zinc-900/[0.04] dark:border-white/25 dark:bg-white/[0.06]"
                  : "border-transparent",
                count > 0 && !selected && "hover:bg-zinc-100/80 dark:hover:bg-white/5",
                count === 0 && "cursor-default",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
                {format(date, "EEE", { locale: dfLocale })}
              </span>
              <span className="metric text-xs font-medium">{format(date, "d")}</span>
              {count === 0 ? (
                <span className="flex h-4 items-center" aria-label={dict.autoSchedule.coverageDayClear}>
                  <Check className="h-3 w-3 text-success/70" aria-hidden />
                </span>
              ) : (
                <span
                  className={cn(
                    "metric flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    hasCritical ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && selectedDay.alerts.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200/60 dark:border-white/5">
          <p className="border-b border-zinc-200/60 bg-zinc-50/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-muted dark:border-white/5 dark:bg-white/[0.03]">
            {format(new Date(selectedDay.date), "EEEE d MMMM", { locale: dfLocale })}
          </p>
          <ul className="divide-y divide-zinc-200/60 dark:divide-white/5">
            {[...selectedDay.alerts]
              .sort((a, b) => a.startHour - b.startHour)
              .map((alert, i) => (
                <li key={`${selectedDay.date}-${i}`} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      isCritical(alert.kind) ? "bg-danger" : "bg-warning",
                    )}
                    aria-hidden
                  />
                  <span className="metric shrink-0 text-foreground-muted">
                    {formatHour(alert.startHour)}–{formatHour(alert.endHour)}
                  </span>
                  <span className="min-w-0 truncate font-medium">
                    {alertLabel(dict, alert, stations, locale)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
