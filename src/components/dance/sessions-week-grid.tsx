"use client";

import { useMemo, useState } from "react";
import { SessionClassCard } from "@/components/dance/session-class-card";
import type { DanceClassRow } from "@/lib/data/dance-admin";
import {
  findSessionConflicts,
  hasAssistantConflict,
  hasInstructorConflict,
  hasRoomConflict,
} from "@/lib/dance/session-conflicts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

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
  const conflicts = useMemo(() => findSessionConflicts(classes), [classes]);

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
              conflicts={conflicts}
            />
          </div>
        ))}
      </div>

      <div className="lg:hidden">
        <DayColumn
          classes={byDay.map[mobileDay] ?? []}
          selectedId={selectedId}
          onSelect={onSelect}
          dict={dict}
          emptyLabel={d.gridEmptyDay}
          conflicts={conflicts}
        />
      </div>

      {byDay.undated.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
            {d.gridOneOff}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {byDay.undated.map((cls) => (
              <SessionClassCard
                key={cls.id}
                cls={cls}
                selected={selectedId === cls.id}
                onSelect={onSelect}
                dict={dict}
                instructorConflict={hasInstructorConflict(conflicts, cls.id)}
                assistantConflict={hasAssistantConflict(conflicts, cls.id)}
                roomConflict={hasRoomConflict(conflicts, cls.id)}
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
  conflicts,
}: {
  classes: DanceClassRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dict: Dictionary;
  emptyLabel: string;
  conflicts: ReturnType<typeof findSessionConflicts>;
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
          <SessionClassCard
            cls={cls}
            selected={selectedId === cls.id}
            onSelect={onSelect}
            dict={dict}
            compact
            instructorConflict={hasInstructorConflict(conflicts, cls.id)}
            assistantConflict={hasAssistantConflict(conflicts, cls.id)}
            roomConflict={hasRoomConflict(conflicts, cls.id)}
          />
        </li>
      ))}
    </ul>
  );
}
