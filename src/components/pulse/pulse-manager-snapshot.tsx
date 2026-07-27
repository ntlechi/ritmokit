import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { PulseWeekSnapshot } from "@/lib/data/pulse";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

function scoreTone(average: number | null): string {
  if (average == null) return "text-foreground-muted";
  if (average >= 4) return "text-success";
  if (average >= 3) return "text-accent";
  if (average >= 2) return "text-warning";
  return "text-danger";
}

export function PulseManagerSnapshot({
  snapshot,
  dict,
  locale,
}: {
  snapshot: PulseWeekSnapshot;
  dict: Dictionary;
  locale: Locale;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          {dict.pulse.weekLabel
            .replace("{week}", String(snapshot.weekNumber))
            .replace("{year}", String(snapshot.year))}
        </p>
        {snapshot.questionText && (
          <p className="mt-2 text-sm text-foreground-muted">{snapshot.questionText}</p>
        )}
        <div className="mt-4 flex items-end gap-3">
          <p className={cn("metric text-4xl font-semibold tracking-tight", scoreTone(snapshot.overallAverage))}>
            {snapshot.overallAverage != null ? snapshot.overallAverage.toFixed(1) : "—"}
          </p>
          <div className="pb-1 text-sm text-foreground-muted">
            <p>{dict.pulse.avgLabel}</p>
            <p>
              {dict.pulse.responseCount.replace("{count}", String(snapshot.responseCount))}
            </p>
          </div>
        </div>
        {snapshot.responseCount > 0 && snapshot.responseCount < 3 && (
          <p className="mt-3 text-xs text-warning">{dict.pulse.lowSampleHint}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{dict.pulse.byStationTitle}</h2>
        {snapshot.byStation.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">{dict.pulse.emptyWeek}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {snapshot.byStation.map((row) => (
              <li
                key={row.stationId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-muted px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {stationLabel(
                      { nameFr: row.stationNameFr, nameEn: row.stationNameEn, nameEs: row.stationNameEs },
                      locale,
                    )}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {dict.pulse.responseCount.replace("{count}", String(row.count))}
                  </p>
                </div>
                <p className={cn("metric text-xl font-semibold", scoreTone(row.average))}>
                  {row.average.toFixed(1)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
