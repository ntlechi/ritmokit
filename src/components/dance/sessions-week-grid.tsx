"use client";

import { useMemo, useState } from "react";
import type { DanceClassRow } from "@/lib/data/dance-admin";
import { styleColors } from "@/lib/dance/style-colors";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function MiniRoleBar({
  filled,
  max,
  tone,
}: {
  filled: number;
  max: number;
  tone: "lead" | "follow";
}) {
  const pct = max > 0 ? Math.min(100, (filled / max) * 100) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex justify-between text-[10px] font-semibold tabular-nums">
        <span className={tone === "lead" ? "text-role-lead" : "text-role-follow"}>
          {tone === "lead" ? "L" : "F"}
        </span>
        <span>
          {filled}/{max}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-background/70">
        <div
          className={cn("h-full rounded-full", tone === "lead" ? "bg-role-lead" : "bg-role-follow")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function parityTone(imbalance: number, waitlisted: number): string {
  if (waitlisted > 0 || imbalance > 2) return "bg-margin-alert/15 text-margin-alert";
  if (imbalance >= 1) return "bg-warning/15 text-warning";
  return "bg-yield/15 text-yield";
}

export function SessionsWeekGrid({
  classes,
  selectedId,
  onSelect,
  dict,
}: {
  classes: DanceClassRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dict: Dictionary;
}) {
  const d = dict.dance;
  const byDay = useMemo(() => {
    const map: DanceClassRow[][] = Array.from({ length: 7 }, () => []);
    const undated: DanceClassRow[] = [];
    for (const cls of classes) {
      if (cls.dayOfWeek == null || cls.dayOfWeek < 0 || cls.dayOfWeek > 6) {
        undated.push(cls);
        continue;
      }
      map[cls.dayOfWeek]!.push(cls);
    }
    for (const list of map) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    undated.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { map, undated };
  }, [classes]);

  const [mobileDay, setMobileDay] = useState(() => new Date().getDay());

  return (
    <div className="space-y-3">
      {/* Mobile day tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden" role="tablist">
        {DAY_KEYS.map((key, idx) => {
          const count = byDay.map[idx]?.length ?? 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mobileDay === idx}
              onClick={() => setMobileDay(idx)}
              className={cn(
                "min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold uppercase tracking-wide",
                mobileDay === idx
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-muted text-foreground-muted",
              )}
            >
              {d.days[key]}
              {count > 0 && (
                <span className="ml-1 tabular-nums opacity-80">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop 7-col grid */}
      <div className="hidden gap-2 lg:grid lg:grid-cols-7">
        {DAY_KEYS.map((key, idx) => (
          <div key={key} className="min-w-0">
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
              {d.days[key]}
            </p>
            <DayColumn
              classes={byDay.map[idx] ?? []}
              selectedId={selectedId}
              onSelect={onSelect}
              dict={dict}
              emptyLabel={d.gridEmptyDay}
            />
          </div>
        ))}
      </div>

      {/* Mobile single-day column */}
      <div className="lg:hidden">
        <DayColumn
          classes={byDay.map[mobileDay] ?? []}
          selectedId={selectedId}
          onSelect={onSelect}
          dict={dict}
          emptyLabel={d.gridEmptyDay}
        />
      </div>

      {byDay.undated.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
            {d.gridOneOff}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {byDay.undated.map((cls) => (
              <ClassCard
                key={cls.id}
                cls={cls}
                selected={selectedId === cls.id}
                onSelect={onSelect}
                dict={dict}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayColumn({
  classes,
  selectedId,
  onSelect,
  dict,
  emptyLabel,
}: {
  classes: DanceClassRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dict: Dictionary;
  emptyLabel: string;
}) {
  if (classes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-2 py-6 text-center text-[11px] text-foreground-muted">
        {emptyLabel}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {classes.map((cls) => (
        <li key={cls.id}>
          <ClassCard
            cls={cls}
            selected={selectedId === cls.id}
            onSelect={onSelect}
            dict={dict}
          />
        </li>
      ))}
    </ul>
  );
}

function ClassCard({
  cls,
  selected,
  onSelect,
  dict,
}: {
  cls: DanceClassRow;
  selected: boolean;
  onSelect: (id: string) => void;
  dict: Dictionary;
}) {
  const colors = styleColors(cls.courseStyle);
  const d = dict.dance;

  return (
    <button
      type="button"
      onClick={() => onSelect(cls.id)}
      className={cn(
        "w-full rounded-2xl border px-3 py-2.5 text-left transition",
        selected
          ? "border-accent shadow-glow ring-1 ring-accent/30"
          : "border-border hover:border-accent/40",
      )}
      style={{ background: colors.soft }}
    >
      <div
        className="mb-2 h-1 rounded-full"
        style={{ background: colors.accent }}
        aria-hidden
      />
      <p className="text-xs font-bold tabular-nums text-foreground">
        {formatClock(cls.startTime)}
        <span className="font-medium text-foreground-muted">–{formatClock(cls.endTime)}</span>
      </p>
      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{cls.courseTitle}</p>
      <p className="mt-0.5 truncate text-[11px] text-foreground-muted">
        {cls.courseStyle} · {cls.roomName}
      </p>
      <div className="mt-2 flex gap-2">
        <MiniRoleBar filled={cls.leadsFilled} max={cls.maxLeads} tone="lead" />
        <MiniRoleBar filled={cls.followsFilled} max={cls.maxFollows} tone="follow" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
            parityTone(cls.imbalance, cls.waitlistedCount),
          )}
        >
          Δ{cls.imbalance}
          {cls.waitlistedCount > 0 ? ` · ${cls.waitlistedCount} ${d.waitlisted}` : ""}
        </span>
        <span className="truncate text-[10px] text-foreground-muted">{cls.instructorName}</span>
      </div>
    </button>
  );
}
