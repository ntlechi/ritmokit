"use client";

import { AlertTriangle } from "lucide-react";
import { CodeRedTrigger } from "@/components/calendar/code-red-trigger";
import { ReplacementFinderTrigger } from "@/components/calendar/replacement-finder-trigger";
import { shiftNeedsReplacement } from "@/components/calendar/replacement-finder-sheet";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatTimeRange } from "@/lib/calendar/format";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";

export function CrisisShiftsBanner({
  shifts,
  dict,
  locale,
  onOpenReplacement,
}: {
  shifts: ShiftWithEmployee[];
  dict: Dictionary;
  locale: Locale;
  onOpenReplacement: (shift: ShiftWithEmployee) => void;
}) {
  const urgent = shifts.filter(shiftNeedsReplacement);
  if (urgent.length === 0) return null;

  return (
    <section className="rounded-2xl border border-danger/30 bg-danger/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-danger">{dict.schedule.replacement.bannerTitle}</p>
            <p className="text-xs text-foreground-muted">{dict.schedule.replacement.bannerSubtitle}</p>
          </div>
          <ul className="space-y-2">
            {urgent.slice(0, 5).map((shift) => (
              <li
                key={shift.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-zinc-900/60"
              >
                <div className="min-w-0 text-xs">
                  <p className="font-medium">
                    {stationLabel(shift.station, locale)} ·{" "}
                    {formatTimeRange(shift.startsAt, shift.endsAt, locale)}
                  </p>
                  <p className="text-foreground-muted">
                    {shift.employee?.fullName ?? dict.calendar.unassigned}
                    {shift.status === "CRISIS_ALERT" && ` · ${dict.shiftStatus.CRISIS_ALERT}`}
                    {shift.urgency === "CODE_RED" && ` · ${dict.schedule.codeRed.badge}`}
                    {shift.surgeBonus != null &&
                      shift.surgeBonus > 0 &&
                      ` · +${shift.surgeBonus}$/h`}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[11rem]">
                  <CodeRedTrigger shift={shift} dict={dict} lang={locale} fullWidth />
                  <ReplacementFinderTrigger
                    shift={shift}
                    dict={dict}
                    onOpen={onOpenReplacement}
                    fullWidth
                  />
                </div>
              </li>
            ))}
          </ul>
          {urgent.length > 5 && (
            <p className="text-xs text-foreground-muted">
              {dict.schedule.replacement.moreShifts.replace("{count}", String(urgent.length - 5))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
