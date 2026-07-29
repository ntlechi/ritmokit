"use client";

import { Thermometer } from "lucide-react";
import { ReportSicknessTrigger, canReportSickness } from "@/components/calendar/report-sickness-trigger";
import type { SicknessFlowResult } from "@/components/calendar/report-sickness-trigger";
import { formatTimeRange } from "@/lib/calendar/format";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import { dna } from "@/lib/design/dna";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

/** Bandeau mobile : quarts du jour assignés — accès 1 tap au signalement maladie. */
export function TodayStaffedShiftsBar({
  shifts,
  dict,
  locale,
  onSicknessSuccess,
}: {
  shifts: ShiftWithEmployee[];
  dict: Dictionary;
  locale: Locale;
  onSicknessSuccess: (result: SicknessFlowResult, shift: ShiftWithEmployee) => void;
}) {
  const todayStaffed = shifts.filter(canReportSickness).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (todayStaffed.length === 0) return null;

  return (
    <section className={cn("p-4 shadow-xs md:hidden", dna.panel)}>
      <div className="mb-3 flex items-center gap-2">
        <Thermometer className="h-4 w-4 text-danger" aria-hidden />
        <div>
          <p className="text-sm font-semibold">{dict.schedule.sickness.todayTitle}</p>
          <p className="text-xs text-foreground-muted">{dict.schedule.sickness.todaySubtitle}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {todayStaffed.map((shift) => (
          <li
            key={shift.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2"
          >
            <div className="min-w-0 text-xs">
              <p className="font-medium">
                {stationLabel(shift.station, locale)} · {formatTimeRange(shift.startsAt, shift.endsAt, locale)}
              </p>
              <p className="text-foreground-muted">{shift.employee?.fullName}</p>
            </div>
            <ReportSicknessTrigger
              shift={shift}
              dict={dict}
              lang={locale}
              onSuccess={onSicknessSuccess}
              fullWidth
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
