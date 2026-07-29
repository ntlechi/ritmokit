"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Grid3x3, Sparkles } from "lucide-react";
import type { HeatmapCell } from "@/lib/dance/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function utilColor(pct: number): string {
  if (pct <= 0) return "bg-surface-muted text-foreground-muted";
  if (pct < 30) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (pct < 60) return "bg-emerald-300/80 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50";
  if (pct < 85) return "bg-emerald-500 text-white dark:bg-emerald-600";
  return "bg-emerald-700 text-white dark:bg-emerald-500";
}

export function RoomHeatmap({
  cells,
  lang,
  dict,
}: {
  cells: HeatmapCell[];
  lang: Locale;
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;
  const rooms = useMemo(() => {
    const map = new Map<string, string>();
    for (const cell of cells) map.set(cell.roomId, cell.roomName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [cells]);

  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const activeRoomId = rooms.some((r) => r.id === roomId) ? roomId : (rooms[0]?.id ?? "");

  const grid = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    for (const cell of cells) {
      if (cell.roomId !== activeRoomId) continue;
      map.set(`${cell.dayOfWeek}:${cell.hour}`, cell);
    }
    return map;
  }, [cells, activeRoomId]);

  const [selected, setSelected] = useState<HeatmapCell | null>(null);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Grid3x3 className="h-4 w-4 text-accent" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">{c.heatmap.title}</h2>
            <p className="text-xs text-foreground-muted">{c.heatmap.subtitle}</p>
          </div>
        </div>
        {rooms.length > 0 && (
          <select
            value={activeRoomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setSelected(null);
            }}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {rooms.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-muted">{c.heatmap.empty}</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-center text-[10px]">
              <thead>
                <tr>
                  <th className="w-10 p-1 text-left font-medium text-foreground-muted" />
                  {c.heatmap.days.map((day) => (
                    <th key={day} className="p-1 font-semibold text-foreground-muted">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => (
                  <tr key={hour}>
                    <td className="p-1 text-left tabular-nums text-foreground-muted">{hour}h</td>
                    {c.heatmap.days.map((_, dayIdx) => {
                      const cell = grid.get(`${dayIdx}:${hour}`);
                      const pct = cell?.utilizationPct ?? 0;
                      const isDead = pct <= 0;
                      return (
                        <td key={`${dayIdx}-${hour}`} className="p-0">
                          <button
                            type="button"
                            title={
                              cell
                                ? `${cell.enrolled}/${cell.capacity} · ${pct.toFixed(0)}%`
                                : "0%"
                            }
                            onClick={() => cell && setSelected(cell)}
                            className={cn(
                              "flex h-7 w-full items-center justify-center rounded-md font-semibold transition hover:ring-2 hover:ring-accent/40",
                              utilColor(pct),
                              selected?.dayOfWeek === dayIdx &&
                                selected.hour === hour &&
                                "ring-2 ring-accent",
                            )}
                          >
                            {isDead ? "·" : `${Math.round(pct)}`}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-foreground-muted">
            <span>{c.heatmap.legendDead}</span>
            <span className="h-3 w-6 rounded bg-surface-muted" />
            <span>{c.heatmap.legendLow}</span>
            <span className="h-3 w-6 rounded bg-emerald-200" />
            <span>{c.heatmap.legendFull}</span>
            <span className="h-3 w-6 rounded bg-emerald-700" />
          </div>

          {selected && selected.utilizationPct <= 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-background/70 px-3 py-3">
              <p className="text-xs font-medium">
                {c.heatmap.deadSlot}: {c.heatmap.days[selected.dayOfWeek]} {selected.hour}h ·{" "}
                {selected.roomName}
              </p>
              <Link
                href={`/${lang}/sessions`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {c.heatmap.promoteSlot}
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
