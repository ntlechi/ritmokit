import { format, isSameMonth } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { ShiftChip } from "@/components/calendar/shift-chip";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { isSameDay } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };
const MAX_CHIPS_PER_DAY = 3;

export function MonthView({
  days,
  shifts,
  anchor,
  locale,
  dict,
}: {
  days: Date[];
  shifts: ShiftWithEmployee[];
  anchor: Date;
  locale: Locale;
  dict: Dictionary;
}) {
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format(days[i], "EEE", { locale: dateFnsLocales[locale] }),
  );

  const shiftsByDay = new Map<string, ShiftWithEmployee[]>();
  for (const shift of shifts) {
    const key = shift.startsAt.toDateString();
    const bucket = shiftsByDay.get(key) ?? [];
    bucket.push(shift);
    shiftsByDay.set(key, bucket);
  }

  const today = new Date();
  const rowCount = Math.ceil(days.length / 7);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
      <div className="grid grid-cols-7 border-b border-zinc-200/80 dark:border-white/10">
        {weekdayLabels.map((label, i) => {
          const isTodayColumn = today.getDay() === days[i].getDay() && isSameMonth(today, anchor);
          return (
            <div
              key={label}
              className={cn(
                "px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em]",
                isTodayColumn ? "text-foreground" : "text-foreground-muted",
              )}
            >
              {label}
            </div>
          );
        })}
      </div>

      <div
        className="grid flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(7rem, 1fr))` }}
      >
        {days.map((day, index) => {
          const dayShifts = shiftsByDay.get(day.toDateString()) ?? [];
          const overflow = dayShifts.length - MAX_CHIPS_PER_DAY;
          const inMonth = isSameMonth(day, anchor);
          const isToday = isSameDay(day, today);
          const lastColumn = (index + 1) % 7 === 0;
          const lastRow = index >= days.length - 7;

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex flex-col gap-1 p-1.5 transition-colors",
                !lastColumn && "border-r border-zinc-200/60 dark:border-white/5",
                !lastRow && "border-b border-zinc-200/60 dark:border-white/5",
                !inMonth && "bg-zinc-100/50 dark:bg-white/[0.03]",
                isToday && "bg-zinc-900/[0.03] dark:bg-white/[0.04]",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center self-start rounded-full font-mono text-xs tabular-nums",
                  isToday
                    ? "bg-zinc-900 font-semibold text-white dark:bg-white dark:text-zinc-900"
                    : inMonth
                      ? "text-foreground"
                      : "text-foreground-muted/50",
                )}
              >
                {format(day, "d")}
              </span>

              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {dayShifts.slice(0, MAX_CHIPS_PER_DAY).map((shift) => (
                  <ShiftChip key={shift.id} shift={shift} locale={locale} dict={dict} compact />
                ))}
                {overflow > 0 && (
                  <span className="px-1 font-mono text-[11px] tabular-nums text-foreground-muted">
                    +{overflow}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
