"use client";

import { useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { ClassCard, type ClassCardData } from "@/components/dance/class-card";
import {
  addCivilDays,
  filterClassGrid,
  gridHourRows,
  type StudioCalendarEvent,
} from "@/lib/dance/studio-calendar";
import { dna } from "@/lib/design/dna";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

function toCardData(event: StudioCalendarEvent, dict: Dictionary): ClassCardData {
  const info = event.classInfo;
  const level = info?.level ?? "";
  return {
    id: event.id,
    title: event.title,
    style: event.style ?? "",
    levelLabel: dict.dance.levels[level as keyof typeof dict.dance.levels] ?? level,
    startLabel: event.timeStart,
    endLabel: event.timeEnd,
    roomName: event.roomName,
    instructorName: info?.instructorName ?? event.subtitle,
    leads: info?.leads ?? 0,
    follows: info?.follows ?? 0,
    booked: event.booked ?? 0,
    capacity: event.capacity ?? 0,
    waitlisted: info?.waitlisted ?? 0,
    newStudents: info?.newStudents ?? 0,
    maxImbalance: info?.maxImbalance ?? Infinity,
    isSocial: event.isSocial,
  };
}

/**
 * Fliip-style week: one column per day, one row per start hour, each class a
 * color-coded card with its fill ratio and Lead/Follow balance.
 */
export function ClassWeekGrid({
  events,
  weekStart,
  todayCivil,
  lang,
  dict,
  selectedId,
  onSelect,
}: {
  events: StudioCalendarEvent[];
  /** Civil YYYY-MM-DD of the first column. */
  weekStart: string;
  todayCivil: string;
  lang: Locale;
  dict: Dictionary;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const copy = dict.studioOps.weekGrid;
  const cardCopy = dict.studioOps.classCard;
  const [instructorId, setInstructorId] = useState("");
  const [style, setStyle] = useState("");

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addCivilDays(weekStart, i)),
    [weekStart],
  );
  const [mobileDay, setMobileDay] = useState(() => {
    const idx = days.indexOf(todayCivil);
    return idx >= 0 ? idx : 0;
  });

  const instructors = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      if (e.classInfo) map.set(e.classInfo.instructorId, e.classInfo.instructorName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [events, lang]);
  const styles = useMemo(
    () =>
      [...new Set(events.filter((e) => e.kind === "class" && e.style).map((e) => e.style!))].sort(
        (a, b) => a.localeCompare(b, lang),
      ),
    [events, lang],
  );

  const visible = useMemo(
    () =>
      filterClassGrid(events, { instructorId: instructorId || null, style: style || null }).filter(
        (e) => e.date >= days[0]! && e.date <= days[6]!,
      ),
    [events, instructorId, style, days],
  );
  const hours = useMemo(() => gridHourRows(visible), [visible]);
  const cell = (date: string, hour: string) =>
    visible.filter((e) => e.date === date && e.timeStart.startsWith(hour));

  const dayLabel = (date: string, format: "short" | "long") =>
    new Intl.DateTimeFormat(lang, {
      weekday: format,
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));

  const renderEvent = (event: StudioCalendarEvent, compact: boolean) =>
    event.kind === "class" ? (
      <ClassCard
        key={event.id}
        data={toCardData(event, dict)}
        copy={cardCopy}
        density={compact ? "compact" : "full"}
        selected={selectedId === event.id}
        onSelect={() => onSelect(event.id)}
      />
    ) : (
      <button
        key={event.id}
        type="button"
        onClick={() => onSelect(event.id)}
        aria-pressed={selectedId === event.id}
        className={cn(
          "w-full rounded-2xl border border-dashed border-border bg-surface-muted/60 px-3 py-2 text-left text-xs",
          selectedId === event.id && "border-accent ring-1 ring-accent/40",
        )}
      >
        <p className="font-bold tabular-nums">
          {event.timeStart}
          <span className="font-medium text-foreground-muted">–{event.timeEnd}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate font-semibold">
          <KeyRound className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{event.title}</span>
        </p>
        <p className="truncate text-[11px] text-foreground-muted">{event.roomName}</p>
      </button>
    );

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          aria-label={copy.allInstructors}
          className={cn(dna.field, "min-h-11 w-auto min-w-[10rem] py-2 text-sm")}
        >
          <option value="">{copy.allInstructors}</option>
          {instructors.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          aria-label={copy.allStyles}
          className={cn(dna.field, "min-h-11 w-auto min-w-[9rem] py-2 text-sm")}
        >
          <option value="">{copy.allStyles}</option>
          {styles.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-foreground-muted">
          <Legend className="border-border bg-surface" label={copy.legendOpen} />
          <Legend className="border-warning/40 bg-warning/15" label={copy.legendAlmost} />
          <Legend className="border-danger/40 bg-danger/15" label={copy.legendFull} />
        </div>
      </div>

      {/* Mobile: one day at a time. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden" role="tablist">
        {days.map((date, idx) => {
          const count = visible.filter((e) => e.date === date).length;
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={mobileDay === idx}
              onClick={() => setMobileDay(idx)}
              className={cn(
                "min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold capitalize",
                mobileDay === idx
                  ? "bg-accent text-accent-foreground"
                  : date === todayCivil
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-muted text-foreground-muted",
              )}
            >
              {dayLabel(date, "short")}
              {count > 0 && <span className="ml-1 tabular-nums opacity-80">({count})</span>}
            </button>
          );
        })}
      </div>
      <div className="space-y-2 lg:hidden">
        {visible.filter((e) => e.date === days[mobileDay]).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-foreground-muted">
            {copy.empty}
          </p>
        ) : (
          visible
            .filter((e) => e.date === days[mobileDay])
            .sort((a, b) => a.timeStart.localeCompare(b.timeStart))
            .map((e) => renderEvent(e, false))
        )}
      </div>

      {/* Desktop: 7 columns × hour rows. */}
      <div className="hidden overflow-x-auto lg:block">
        {hours.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-foreground-muted">
            {copy.empty}
          </p>
        ) : (
          <div
            className="grid min-w-[56rem] gap-x-2 gap-y-2"
            style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}
          >
            <div />
            {days.map((date) => (
              <p
                key={date}
                className={cn(
                  "sticky top-0 rounded-lg py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.1em]",
                  date === todayCivil ? "bg-accent text-accent-foreground" : "text-foreground-muted",
                )}
              >
                {dayLabel(date, "short")}
              </p>
            ))}
            {hours.map((hour) => (
              <HourRow key={hour} hour={hour}>
                {days.map((date) => (
                  <div
                    key={date}
                    className={cn(
                      "min-w-0 space-y-2 rounded-xl p-1",
                      date === todayCivil && "bg-accent/5",
                    )}
                  >
                    {cell(date, hour).map((e) => renderEvent(e, true))}
                  </div>
                ))}
              </HourRow>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HourRow({ hour, children }: { hour: string; children: React.ReactNode }) {
  return (
    <>
      <p className="pt-2 text-right text-xs font-semibold tabular-nums text-foreground-muted">
        {hour}:00
      </p>
      {children}
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-full border", className)} aria-hidden />
      {label}
    </span>
  );
}
