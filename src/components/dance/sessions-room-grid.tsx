"use client";

import { useMemo, useState } from "react";
import { SessionClassCard } from "@/components/dance/session-class-card";
import { dna } from "@/lib/design/dna";
import type { DanceClassRow, DanceRoomOption } from "@/lib/data/dance-admin";
import {
  findSessionConflicts,
  hasAssistantConflict,
  hasInstructorConflict,
  hasRoomConflict,
} from "@/lib/dance/session-conflicts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Dance-first room matrix: columns = studios, rows = sessions for a selected day.
 * Makes room collisions and staffing visible at a glance.
 */
export function SessionsRoomGrid({
  classes,
  rooms,
  selectedId,
  onSelect,
  dict,
}: {
  classes: DanceClassRow[];
  rooms: DanceRoomOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dict: Dictionary;
}) {
  const d = dict.dance;
  const [day, setDay] = useState(() => {
    const today = new Date().getDay();
    const withClasses = DAY_KEYS.findIndex((_, idx) =>
      classes.some((c) => c.dayOfWeek === idx),
    );
    return withClasses >= 0 ? withClasses : today;
  });

  const conflicts = useMemo(() => findSessionConflicts(classes), [classes]);

  const dayClasses = useMemo(
    () =>
      classes
        .filter((c) => c.dayOfWeek === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [classes, day],
  );

  const byRoom = useMemo(() => {
    const map = new Map<string, DanceClassRow[]>();
    for (const room of rooms) map.set(room.id, []);
    const unassigned: DanceClassRow[] = [];
    for (const cls of dayClasses) {
      const list = map.get(cls.roomId);
      if (list) list.push(cls);
      else unassigned.push(cls);
    }
    return { map, unassigned };
  }, [dayClasses, rooms]);

  const columns = rooms.length > 0 ? rooms : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn(dna.pillTrack, "flex-wrap")}>
          {DAY_KEYS.map((key, idx) => {
            const count = classes.filter((c) => c.dayOfWeek === idx).length;
            return (
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
                {count > 0 && <span className="ml-1 opacity-80">({count})</span>}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-foreground-muted">{d.viewRoomsHint}</p>
      </div>

      {columns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-foreground-muted">
          {d.gridEmptyRooms}
        </p>
      ) : (
        <div
          className="grid gap-3 overflow-x-auto pb-1"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))`,
          }}
        >
          {columns.map((room) => {
            const list = byRoom.map.get(room.id) ?? [];
            return (
              <section
                key={room.id}
                className="min-w-[220px] rounded-2xl border border-border bg-surface p-3 shadow-xs"
              >
                <header className="mb-3 border-b border-border pb-2">
                  <h3 className="truncate text-sm font-bold tracking-tight">{room.name}</h3>
                  <p className="mt-0.5 text-[11px] text-foreground-muted">
                    {room.surfaceSqm != null ? `${room.surfaceSqm} m²` : "—"}
                    {room.capacity != null && (
                      <>
                        {" · "}
                        {room.capacity} {d.roomSpots}
                      </>
                    )}
                  </p>
                </header>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-2 py-8 text-center text-[11px] text-foreground-muted">
                    {d.gridEmptyDay}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((cls) => (
                      <li key={cls.id}>
                        <SessionClassCard
                          cls={cls}
                          selected={selectedId === cls.id}
                          onSelect={onSelect}
                          dict={dict}
                          showRoom={false}
                          instructorConflict={hasInstructorConflict(conflicts, cls.id)}
                          assistantConflict={hasAssistantConflict(conflicts, cls.id)}
                          roomConflict={hasRoomConflict(conflicts, cls.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {byRoom.unassigned.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
            {d.gridUnassignedRoom}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {byRoom.unassigned.map((cls) => (
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
