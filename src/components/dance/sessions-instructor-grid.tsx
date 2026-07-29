"use client";

import { useMemo, useState } from "react";
import { SessionClassCard } from "@/components/dance/session-class-card";
import { dna } from "@/lib/design/dna";
import type { DanceClassRow, DanceInstructorOption } from "@/lib/data/dance-admin";
import {
  findSessionConflicts,
  hasInstructorConflict,
  hasRoomConflict,
} from "@/lib/dance/session-conflicts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Columns = instructors — catches double-booking across rooms at a glance. */
export function SessionsInstructorGrid({
  classes,
  instructors,
  selectedId,
  onSelect,
  dict,
}: {
  classes: DanceClassRow[];
  instructors: DanceInstructorOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dict: Dictionary;
}) {
  const d = dict.dance;
  const [day, setDay] = useState(() => new Date().getDay());
  const conflicts = useMemo(() => findSessionConflicts(classes), [classes]);

  const dayClasses = useMemo(
    () =>
      classes
        .filter((c) => c.dayOfWeek === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [classes, day],
  );

  const activeInstructors = useMemo(() => {
    const ids = new Set(dayClasses.map((c) => c.instructorId));
    const listed = instructors.filter((i) => ids.has(i.id));
    // Include anyone teaching that day even if not in roster options
    for (const cls of dayClasses) {
      if (!listed.some((i) => i.id === cls.instructorId)) {
        listed.push({ id: cls.instructorId, fullName: cls.instructorName });
      }
    }
    return listed.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [dayClasses, instructors]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn(dna.pillTrack, "flex-wrap")}>
          {DAY_KEYS.map((key, idx) => (
            <button
              key={key}
              type="button"
              onClick={() => setDay(idx)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wide",
                day === idx ? dna.pillActive : dna.pillIdle,
              )}
            >
              {d.days[key]}
            </button>
          ))}
        </div>
        <p className="text-xs text-foreground-muted">{d.viewInstructorsHint}</p>
      </div>

      {activeInstructors.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-foreground-muted">
          {d.gridEmptyDay}
        </p>
      ) : (
        <div
          className="grid gap-3 overflow-x-auto pb-1"
          style={{
            gridTemplateColumns: `repeat(${activeInstructors.length}, minmax(220px, 1fr))`,
          }}
        >
          {activeInstructors.map((instructor) => {
            const list = dayClasses.filter((c) => c.instructorId === instructor.id);
            const conflicted = list.some((c) => hasInstructorConflict(conflicts, c.id));
            return (
              <section
                key={instructor.id}
                className={cn(
                  "min-w-[220px] rounded-2xl border bg-surface p-3 shadow-xs",
                  conflicted ? "border-margin-alert/40" : "border-border",
                )}
              >
                <header className="mb-3 border-b border-border pb-2">
                  <h3 className="truncate text-sm font-bold tracking-tight">
                    {instructor.fullName}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-foreground-muted">
                    {list.length} {d.classesCount}
                    {conflicted && (
                      <span className="ml-1 font-semibold text-margin-alert">
                        · {d.conflictInstructor}
                      </span>
                    )}
                  </p>
                </header>
                <ul className="space-y-2">
                  {list.map((cls) => (
                    <li key={cls.id}>
                      <SessionClassCard
                        cls={cls}
                        selected={selectedId === cls.id}
                        onSelect={onSelect}
                        dict={dict}
                        compact
                        instructorConflict={hasInstructorConflict(conflicts, cls.id)}
                        roomConflict={hasRoomConflict(conflicts, cls.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
