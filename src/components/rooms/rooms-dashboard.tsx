"use client";

import { useState } from "react";
import { Maximize2, Pencil, Plus, Ruler, Users } from "lucide-react";
import { MiniBars, ProgressRing, toneForHigher } from "@/components/charts/primitives";
import { StationEditor } from "@/components/manager/stations-dashboard";
import type { RoomOverviewEntry, RoomsOverview } from "@/lib/data/rooms-overview";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { KPI_FLOOR_UTIL_GOOD_MIN, KPI_FLOOR_UTIL_WARN_MIN } from "@/lib/kpi/thresholds";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

function RoomCard({
  entry,
  locationId,
  lang,
  dict,
}: {
  entry: RoomOverviewEntry;
  locationId: string;
  lang: Locale;
  dict: Dictionary;
}) {
  const [editing, setEditing] = useState(false);
  const { room, usage } = entry;
  const r = dict.rooms;
  const util = usage.avgUtilizationPct ?? 0;
  const name = stationLabel(room, lang);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition hover:shadow-sm",
        !room.isActive && "opacity-60",
      )}
    >
      {/* Colour rail keyed to the room, matching calendar and schedule chips. */}
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: room.colorHex }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3 p-5 pt-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: room.colorHex }}
              aria-hidden
            />
            <h3 className="truncate text-base font-semibold">{name}</h3>
            {!room.isActive && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                {r.inactive}
              </span>
            )}
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground-muted">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <dt className="sr-only">{r.capacity}</dt>
              <dd className="tabular-nums">
                {room.capacity != null ? `${room.capacity} ${r.spots}` : "—"}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5" aria-hidden />
              <dt className="sr-only">{r.surface}</dt>
              <dd className="tabular-nums">
                {room.surfaceSqm != null ? `${room.surfaceSqm} m²` : "—"}
              </dd>
            </div>
            {room.capacity != null && room.surfaceSqm != null && room.surfaceSqm > 0 && (
              <div className="flex items-center gap-1.5">
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                <dt className="sr-only">{r.spacePerDancer}</dt>
                <dd className="tabular-nums">
                  {(room.surfaceSqm / room.capacity).toFixed(1)} m²/{r.dancer}
                </dd>
              </div>
            )}
          </dl>

          {usage.styles.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {usage.styles.slice(0, 4).map((style) => (
                <li
                  key={style}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground-muted"
                >
                  {style}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <ProgressRing
            value={util}
            size={64}
            caption={`${name} — ${r.occupancy}`}
            tone={
              usage.classCount === 0
                ? "muted"
                : toneForHigher(util, KPI_FLOOR_UTIL_GOOD_MIN, KPI_FLOOR_UTIL_WARN_MIN)
            }
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            {r.occupancy}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-border bg-border">
        <div className="bg-surface px-3 py-2.5 text-center">
          <p className="metric text-sm font-semibold tabular-nums">{usage.classCount}</p>
          <p className="text-[10px] text-foreground-muted">{r.classesPerWeek}</p>
        </div>
        <div className="bg-surface px-3 py-2.5 text-center">
          <p className="metric text-sm font-semibold tabular-nums">{usage.enrolled}</p>
          <p className="text-[10px] text-foreground-muted">{r.students}</p>
        </div>
        <div className="bg-surface px-3 py-2.5 text-center">
          <p className="metric text-sm font-semibold tabular-nums">
            {usage.yieldPerSqm != null ? `${usage.yieldPerSqm.toFixed(0)} $` : "—"}
          </p>
          <p className="text-[10px] text-foreground-muted">{r.yieldPerSqm}</p>
        </div>
      </div>

      <div className="border-t border-border px-5 py-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            {r.weekRhythm}
          </p>
          {usage.peakHour != null && (
            <p className="text-[10px] text-foreground-muted">
              {r.peak} {String(usage.peakHour).padStart(2, "0")}:00
            </p>
          )}
        </div>
        <MiniBars
          className="mt-1.5"
          height={44}
          maxBarWidth={26}
          showValues
          bars={usage.byDay.map((value, i) => ({
            label: dict.studioCockpit.heatmap.days[i] ?? String(i),
            value,
            color: room.colorHex,
          }))}
          caption={`${name} — ${r.weekRhythm}`}
        />
      </div>

      <div className="border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          {editing ? dict.common.cancel : r.edit}
        </button>
        {editing && (
          <div className="mt-3">
            <StationEditor
              station={room}
              locationId={locationId}
              lang={lang}
              dict={dict}
              locale={lang}
              kind="ROOM"
            />
          </div>
        )}
      </div>
    </article>
  );
}

export function RoomsDashboard({
  overview,
  lang,
  dict,
}: {
  overview: RoomsOverview;
  lang: Locale;
  dict: Dictionary;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const r = dict.rooms;
  const { totals } = overview;

  return (
    <div className="space-y-5">
      {/* Studio-wide summary */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-muted">{r.totalRooms}</p>
          <p className="metric mt-1 text-2xl font-semibold tabular-nums">{totals.roomCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-muted">{r.totalCapacity}</p>
          <p className="metric mt-1 text-2xl font-semibold tabular-nums">{totals.totalCapacity}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-muted">{r.totalSurface}</p>
          <p className="metric mt-1 text-2xl font-semibold tabular-nums">
            {totals.totalSurfaceSqm.toFixed(0)} m²
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground-muted">{r.avgOccupancy}</p>
            <p className="metric mt-1 text-2xl font-semibold tabular-nums">
              {totals.avgUtilizationPct != null ? `${totals.avgUtilizationPct.toFixed(0)}%` : "—"}
            </p>
          </div>
          <ProgressRing
            value={totals.avgUtilizationPct ?? 0}
            size={52}
            caption={r.avgOccupancy}
            tone={
              totals.avgUtilizationPct == null
                ? "muted"
                : toneForHigher(
                    totals.avgUtilizationPct,
                    KPI_FLOOR_UTIL_GOOD_MIN,
                    KPI_FLOOR_UTIL_WARN_MIN,
                  )
            }
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted">{r.intro}</p>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted",
            showCreate && "bg-surface-muted",
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {r.addRoom}
        </button>
      </div>

      {showCreate && (
        <StationEditor
          locationId={overview.locationId}
          lang={lang}
          dict={dict}
          locale={lang}
          kind="ROOM"
          onCreated={() => setShowCreate(false)}
        />
      )}

      {overview.rooms.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface-muted/50 px-4 py-10 text-center text-sm text-foreground-muted">
          {r.empty}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {overview.rooms.map((entry) => (
            <RoomCard
              key={entry.room.id}
              entry={entry}
              locationId={overview.locationId}
              lang={lang}
              dict={dict}
            />
          ))}
        </div>
      )}
    </div>
  );
}
