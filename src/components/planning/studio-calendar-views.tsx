"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, isSameMonth } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { getMonthGridDays, getWeekDays, isSameDay, type StudioPeriodView } from "@/lib/calendar/grid";
import { dayCounts, type StudioCalendarEvent } from "@/lib/dance/studio-calendar";
import { dna } from "@/lib/design/dna";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const dateFnsLocales = { fr, en: enUS, es } as const;
const MAX_CHIPS = 3;

export function StudioCalendarViews({
  view,
  anchor,
  byDate,
  events,
  locale,
  dict,
  selectedId,
  onSelect,
}: {
  view: StudioPeriodView;
  anchor: Date;
  byDate: Map<string, StudioCalendarEvent[]>;
  events: StudioCalendarEvent[];
  locale: Locale;
  dict: Dictionary;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (view === "week") {
    return (
      <WeekGrid
        anchor={anchor}
        byDate={byDate}
        locale={locale}
        dict={dict}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    );
  }
  if (view === "month") {
    return (
      <MonthGrid
        anchor={anchor}
        byDate={byDate}
        locale={locale}
        dict={dict}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    );
  }
  return (
    <HeatGrid
      view={view}
      anchor={anchor}
      events={events}
      locale={locale}
      dict={dict}
    />
  );
}

function civilOf(day: Date) {
  return format(day, "yyyy-MM-dd");
}

function WeekGrid({
  anchor,
  byDate,
  locale,
  dict,
  selectedId,
  onSelect,
}: {
  anchor: Date;
  byDate: Map<string, StudioCalendarEvent[]>;
  locale: Locale;
  dict: Dictionary;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const days = getWeekDays(anchor);
  const today = new Date();
  const [mobileDay, setMobileDay] = useState(() => {
    const idx = days.findIndex((d) => isSameDay(d, today));
    return idx >= 0 ? idx : 0;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden" role="tablist">
        {days.map((day, idx) => {
          const count = byDate.get(civilOf(day))?.length ?? 0;
          return (
            <button
              key={day.toISOString()}
              type="button"
              role="tab"
              aria-selected={mobileDay === idx}
              data-interactive
              onClick={() => setMobileDay(idx)}
              className={cn(
                "min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold uppercase tracking-wide",
                mobileDay === idx ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground-muted",
              )}
            >
              {format(day, "EEE d", { locale: dateFnsLocales[locale] })}
              {count > 0 && <span className="ml-1 tabular-nums opacity-80">({count})</span>}
            </button>
          );
        })}
      </div>

      <div className="hidden gap-2 lg:grid lg:grid-cols-7">
        {days.map((day) => (
          <DayColumn
            key={day.toISOString()}
            day={day}
            events={byDate.get(civilOf(day)) ?? []}
            locale={locale}
            dict={dict}
            selectedId={selectedId}
            onSelect={onSelect}
            highlight={isSameDay(day, today)}
          />
        ))}
      </div>

      <div className="lg:hidden">
        <DayColumn
          day={days[mobileDay]!}
          events={byDate.get(civilOf(days[mobileDay]!)) ?? []}
          locale={locale}
          dict={dict}
          selectedId={selectedId}
          onSelect={onSelect}
          highlight={isSameDay(days[mobileDay]!, today)}
        />
      </div>
    </div>
  );
}

function DayColumn({
  day,
  events,
  locale,
  dict,
  selectedId,
  onSelect,
  highlight,
}: {
  day: Date;
  events: StudioCalendarEvent[];
  locale: Locale;
  dict: Dictionary;
  selectedId: string | null;
  onSelect: (id: string) => void;
  highlight: boolean;
}) {
  return (
    <section className={cn(dna.panel, "flex min-h-[18rem] flex-col p-2")}>
      <h3
        className={cn(
          "px-1 pb-2 text-xs font-bold uppercase tracking-wide",
          highlight ? "text-accent" : "text-foreground-muted",
        )}
      >
        {format(day, "EEE d", { locale: dateFnsLocales[locale] })}
      </h3>
      <div className="flex flex-1 flex-col gap-1.5">
        {events.length === 0 ? (
          <p className="px-1 text-xs text-foreground-muted">{dict.planning.empty}</p>
        ) : (
          events.map((event) => (
            <EventChip
              key={event.id}
              event={event}
              selected={selectedId === event.id}
              onSelect={onSelect}
              compact={false}
            />
          ))
        )}
      </div>
    </section>
  );
}

function MonthGrid({
  anchor,
  byDate,
  locale,
  dict,
  selectedId,
  onSelect,
}: {
  anchor: Date;
  byDate: Map<string, StudioCalendarEvent[]>;
  locale: Locale;
  dict: Dictionary;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const days = getMonthGridDays(anchor);
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format(days[i]!, "EEE", { locale: dateFnsLocales[locale] }),
  );
  const today = new Date();
  const rowCount = Math.ceil(days.length / 7);

  return (
    <div className={cn("flex flex-col overflow-hidden", dna.panel)}>
      <div className="grid grid-cols-7 border-b border-border">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-muted"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${rowCount}, minmax(6.5rem, 1fr))` }}>
        {days.map((day, index) => {
          const list = byDate.get(civilOf(day)) ?? [];
          const overflow = list.length - MAX_CHIPS;
          const inMonth = isSameMonth(day, anchor);
          const lastColumn = (index + 1) % 7 === 0;
          const lastRow = index >= days.length - 7;
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex flex-col gap-1 p-1.5",
                !lastColumn && "border-r border-border",
                !lastRow && "border-b border-border",
                !inMonth && "bg-surface-muted/50",
                isSameDay(day, today) && "bg-accent/5",
              )}
            >
              <p
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  isSameDay(day, today) ? "text-accent" : "text-foreground-muted",
                )}
              >
                {format(day, "d")}
              </p>
              {list.slice(0, MAX_CHIPS).map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  selected={selectedId === event.id}
                  onSelect={onSelect}
                  compact
                />
              ))}
              {overflow > 0 && (
                <p className="px-1 text-[10px] font-semibold text-foreground-muted">
                  {dict.planning.more.replace("{n}", String(overflow))}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeatGrid({
  view,
  anchor,
  events,
  locale,
  dict,
}: {
  view: "quarter" | "year";
  anchor: Date;
  events: StudioCalendarEvent[];
  locale: Locale;
  dict: Dictionary;
}) {
  const counts = useMemo(() => dayCounts(events), [events]);
  const months =
    view === "quarter"
      ? [0, 1, 2].map((i) => new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3 + i, 1))
      : Array.from({ length: 12 }, (_, i) => new Date(anchor.getFullYear(), i, 1));

  return (
    <div className={cn("grid gap-3", view === "year" ? "sm:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-3")}>
      {months.map((month) => {
        const days = getMonthGridDays(month);
        const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
          format(days[i]!, "EEEEE", { locale: dateFnsLocales[locale] }),
        );
        return (
          <section key={month.toISOString()} className={cn(dna.panel, "p-3")}>
            <h3 className="mb-2 text-sm font-semibold capitalize">
              {format(month, "MMMM yyyy", { locale: dateFnsLocales[locale] })}
            </h3>
            <div className="grid grid-cols-7 gap-1">
              {weekdayLabels.map((label, i) => (
                <span key={`${label}-${i}`} className="text-center text-[10px] font-semibold text-foreground-muted">
                  {label}
                </span>
              ))}
              {days.map((day) => {
                const civil = civilOf(day);
                const tally = counts.get(civil);
                const total = (tally?.classes ?? 0) + (tally?.rentals ?? 0);
                const inMonth = isSameMonth(day, month);
                const intensity =
                  total === 0 ? "" : total === 1 ? "bg-accent/25" : total <= 3 ? "bg-accent/50" : "bg-accent text-accent-foreground";
                const labelText = `${format(day, "d MMM")} — ${dict.planning.classesCount.replace("{n}", String(tally?.classes ?? 0))}, ${dict.planning.rentalsCount.replace("{n}", String(tally?.rentals ?? 0))}`;
                return (
                  <Link
                    key={day.toISOString()}
                    href={`/${locale}/planning?view=week&date=${civil}`}
                    title={labelText}
                    aria-label={labelText}
                    className={cn(
                      "flex h-11 min-h-11 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums",
                      !inMonth && "opacity-30",
                      intensity || "bg-surface-muted text-foreground-muted",
                    )}
                  >
                    <span aria-hidden>{format(day, "d")}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EventChip({
  event,
  selected,
  onSelect,
  compact,
}: {
  event: StudioCalendarEvent;
  selected: boolean;
  onSelect: (id: string) => void;
  compact: boolean;
}) {
  const tone =
    event.kind === "rental"
      ? "border-warning/40 bg-warning/10 text-warning"
      : event.isSocial
        ? "border-live/40 bg-live/10 text-live"
        : "border-accent/30 bg-accent/10 text-accent";

  return (
    <button
      type="button"
      data-interactive
      onClick={() => onSelect(event.id)}
      aria-pressed={selected}
      className={cn(
        "min-h-11 w-full rounded-lg border px-2 text-left transition",
        compact ? "min-h-9 py-1" : "py-1.5",
        tone,
        selected && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
        !event.onWebsite && "opacity-70",
      )}
    >
      <p className={cn("truncate font-semibold", compact ? "text-[10px]" : "text-xs")}>
        {event.timeStart} {event.title}
      </p>
      {!compact && (
        <p className="mt-0.5 truncate text-[10px] opacity-80">
          {event.roomName}
          {event.kind === "class" && event.attended != null ? ` · ${event.attended}` : ""}
        </p>
      )}
    </button>
  );
}
