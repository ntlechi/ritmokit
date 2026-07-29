"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, startOfWeek, addDays } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { WEEK_START_COOKIE, type WeekStartDay } from "@/lib/calendar/week-start";
import { dna } from "@/lib/design/dna";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

/** Sunday and Monday first — the common cases — then the rest of the week. */
const DAY_ORDER: WeekStartDay[] = [0, 1, 2, 3, 4, 5, 6];

function persistWeekStart(day: WeekStartDay) {
  document.cookie = `${WEEK_START_COOKIE}=${day}; path=/; max-age=31536000; samesite=lax`;
}

export function WeekStartPicker({
  value,
  locale,
  dict,
}: {
  value: WeekStartDay;
  locale: Locale;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const anchorSunday = startOfWeek(new Date(), { weekStartsOn: 0 });
  const dfLocale = dateFnsLocales[locale];
  const dayName = (day: WeekStartDay, pattern: string) =>
    format(addDays(anchorSunday, day), pattern, { locale: dfLocale });

  function select(day: WeekStartDay) {
    persistWeekStart(day);
    setOpen(false);
    router.refresh();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-interactive
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium capitalize text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <CalendarDays className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{dayName(value, "EEE")}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={dict.calendar.weekStartLabel}
          className="absolute right-0 top-full z-30 mt-1.5 w-48 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
            {dict.calendar.weekStartLabel}
          </p>
          {DAY_ORDER.map((day) => {
            const active = day === value;
            return (
              <button
                key={day}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => select(day)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm capitalize transition-colors",
                  active
                    ? "bg-surface-muted font-medium text-foreground"
                    : cn(dna.pillIdle, "hover:bg-surface-muted"),
                )}
              >
                {dayName(day, "EEEE")}
                {active && <Check className="h-3.5 w-3.5" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
