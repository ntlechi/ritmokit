import { AlertTriangle, Shield } from "lucide-react";
import { fr, enUS, es } from "date-fns/locale";
import { format } from "date-fns";
import type { DaySuccessionAlerts } from "@/lib/data/skills";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import type { StationRecord } from "@/lib/stations/display";
import { stationLabel } from "@/lib/stations/display";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function SuccessionAlertsBanner({
  days,
  stations,
  locale,
  dict,
}: {
  days: DaySuccessionAlerts[];
  stations: StationRecord[];
  locale: Locale;
  dict: Dictionary;
}) {
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const withGaps = days.filter((d) => d.gaps.length > 0);
  if (withGaps.length === 0) return null;

  const total = withGaps.reduce((sum, d) => sum + d.gaps.length, 0);

  return (
    <section className="rounded-2xl border border-warning/30 bg-warning/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-warning">{dict.skills.successionTitle}</p>
            <p className="text-xs text-foreground-muted">
              {dict.skills.successionSubtitle.replace("{count}", String(total))}
            </p>
          </div>
          <ul className="space-y-2">
            {withGaps.map((day) => (
              <li key={day.date} className="space-y-1">
                <span className="text-xs font-medium capitalize text-foreground-muted">
                  {format(new Date(day.date), "EEE d MMM", { locale: dateFnsLocales[locale] })}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {day.gaps.map((gap, i) => (
                    <Badge key={`${day.date}-${i}`} tone="warning">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      {formatHour(gap.startHour)}–{formatHour(gap.endHour)}{" "}
                      {dict.skills.noLeadAlert.replace(
                        "{station}",
                        stationLabel(stationById.get(gap.stationId) ?? { nameFr: gap.stationId, nameEn: gap.stationId, nameEs: gap.stationId }, locale),
                      )}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
