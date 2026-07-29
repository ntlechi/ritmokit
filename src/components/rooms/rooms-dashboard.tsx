"use client";

import { useState } from "react";
import { Pencil, Plus, Ruler, Users } from "lucide-react";
import { StationEditor } from "@/components/manager/stations-dashboard";
import { dna } from "@/lib/design/dna";
import type { RoomOverviewEntry, RoomsOverview } from "@/lib/data/rooms-overview";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

function money(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

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
  const name = stationLabel(room, lang);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xs",
        !room.isActive && "opacity-60",
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: room.colorHex }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3 p-5 pl-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold tracking-tight">{name}</h3>
            {!room.isActive && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                {r.inactive}
              </span>
            )}
          </div>
          {usage.styles.length > 0 && (
            <p className="mt-1 truncate text-xs text-foreground-muted">
              {usage.styles.slice(0, 4).join(" · ")}
              {usage.styles.length > 4 ? ` +${usage.styles.length - 4}` : ""}
            </p>
          )}
        </div>
        <p className="shrink-0 text-right text-xs text-foreground-muted">
          <span className="metric block text-base font-semibold tabular-nums text-foreground">
            {usage.classCount}
          </span>
          {r.classesPerWeek}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 px-5 pb-4 pl-6 sm:grid-cols-4">
        <div className="rounded-xl bg-surface-muted/70 px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            <Ruler className="h-3 w-3" aria-hidden />
            {r.surface}
          </dt>
          <dd className="metric mt-1 text-xl font-semibold tabular-nums">
            {room.surfaceSqm != null ? `${room.surfaceSqm}` : "—"}
            {room.surfaceSqm != null && (
              <span className="ml-1 text-xs font-medium text-foreground-muted">m²</span>
            )}
          </dd>
        </div>
        <div className="rounded-xl bg-surface-muted/70 px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            <Users className="h-3 w-3" aria-hidden />
            {r.capacity}
          </dt>
          <dd className="metric mt-1 text-xl font-semibold tabular-nums">
            {room.capacity != null ? room.capacity : "—"}
            {room.capacity != null && (
              <span className="ml-1 text-xs font-medium text-foreground-muted">{r.spots}</span>
            )}
          </dd>
        </div>
        <div className="rounded-xl bg-accent/10 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            {r.yieldPerHour}
          </dt>
          <dd className="metric mt-1 text-xl font-semibold tabular-nums text-accent">
            {usage.yieldPerHour != null ? money(usage.yieldPerHour, lang) : "—"}
          </dd>
        </div>
        <div className="rounded-xl bg-yield/10 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-yield">
            {r.yieldPerSqm}
          </dt>
          <dd className="metric mt-1 text-xl font-semibold tabular-nums text-yield">
            {usage.yieldPerSqm != null ? money(usage.yieldPerSqm, lang) : "—"}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 pl-6">
        <p className="text-xs text-foreground-muted">
          {usage.enrolled} {r.students}
          {usage.avgUtilizationPct != null && (
            <>
              {" · "}
              {usage.avgUtilizationPct.toFixed(0)}% {r.occupancy.toLowerCase()}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className={dna.ctaGhost + " !px-3 !py-1.5 !text-xs"}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          {editing ? dict.common.cancel : r.edit}
        </button>
      </div>

      {editing && (
        <div className="border-t border-border px-5 py-3 pl-6">
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
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground-muted">
          <p>
            <span className="metric text-foreground">{totals.roomCount}</span> {r.totalRooms.toLowerCase()}
          </p>
          <p>
            <span className="metric text-foreground">{totals.totalCapacity}</span> {r.spots}
          </p>
          <p>
            <span className="metric text-foreground">{totals.totalSurfaceSqm.toFixed(0)}</span> m²
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
          className={dna.cta}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {r.addRoom}
        </button>
      </section>

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
