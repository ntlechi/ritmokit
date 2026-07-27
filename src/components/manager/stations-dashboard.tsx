"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { createStationAction, updateStationAction } from "@/lib/actions/stations";
import { stationLabel, type StationRecord } from "@/lib/stations/display";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.manager.stations.errors.unauthorized,
    missing_names: dict.manager.stations.errors.missingNames,
    invalid_color: dict.manager.stations.errors.invalidColor,
    invalid_tip_points: dict.manager.stations.errors.invalidTipPoints,
    not_found: dict.manager.stations.errors.notFound,
    database_error: dict.manager.stations.errors.databaseError,
  };
  return map[code] ?? dict.manager.stations.errors.databaseError;
}

function StationEditor({
  station,
  locationId,
  lang,
  dict,
  locale,
  onCreated,
}: {
  station?: StationRecord;
  locationId: string;
  lang: string;
  dict: Dictionary;
  locale: Locale;
  onCreated?: (stationId: string) => void;
}) {
  const [values, setValues] = useState({
    nameFr: station?.nameFr ?? "",
    nameEn: station?.nameEn ?? "",
    nameEs: station?.nameEs ?? "",
    colorHex: station?.colorHex ?? "#64748b",
    slug: station?.slug ?? "",
    tipPoints: String(station?.tipPoints ?? 1),
    isActive: station?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const payload = {
        lang,
        locationId,
        nameFr: values.nameFr,
        nameEn: values.nameEn,
        nameEs: values.nameEs,
        colorHex: values.colorHex,
        slug: values.slug || undefined,
      };

      const result = station
        ? await updateStationAction({
            ...payload,
            stationId: station.id,
            isActive: values.isActive,
            tipPoints: Number(values.tipPoints),
          })
        : await createStationAction(payload);

      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setSuccess(dict.manager.stations.saveSuccess);
      onCreated?.(result.stationId);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="h-4 w-4 rounded-full ring-1 ring-border"
          style={{ backgroundColor: values.colorHex }}
          aria-hidden
        />
        <h3 className="text-sm font-semibold">
          {station ? stationLabel(station, locale) : dict.manager.stations.newStation}
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.stations.nameFr}
          <input
            value={values.nameFr}
            onChange={(e) => setValues((v) => ({ ...v, nameFr: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.stations.nameEn}
          <input
            value={values.nameEn}
            onChange={(e) => setValues((v) => ({ ...v, nameEn: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.stations.nameEs}
          <input
            value={values.nameEs}
            onChange={(e) => setValues((v) => ({ ...v, nameEs: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.stations.colorHex}
          <input
            value={values.colorHex}
            onChange={(e) => setValues((v) => ({ ...v, colorHex: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.stations.slug}
          <input
            value={values.slug}
            onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        {station && (
          <>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              {dict.manager.stations.tipPoints}
              <input
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                value={values.tipPoints}
                onChange={(e) => setValues((v) => ({ ...v, tipPoints: e.target.value }))}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))}
              />
              {dict.manager.stations.isActive}
            </label>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {isPending ? dict.manager.stations.saving : dict.manager.stations.save}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
        {success && <span className="text-xs text-success">{success}</span>}
      </div>
    </div>
  );
}

export function StationsDashboard({
  locationId,
  stations: initialStations,
  dict,
  locale,
  lang,
}: {
  locationId: string;
  stations: StationRecord[];
  dict: Dictionary;
  locale: Locale;
  lang: string;
}) {
  const [stations, setStations] = useState(initialStations);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted">{dict.manager.stations.subtitle}</p>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted",
            showCreate && "bg-surface-muted",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          {dict.manager.stations.addStation}
        </button>
      </div>

      {showCreate && (
        <StationEditor
          locationId={locationId}
          lang={lang}
          dict={dict}
          locale={locale}
          onCreated={() => setShowCreate(false)}
        />
      )}

      {stations.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-muted px-4 py-8 text-center text-sm text-foreground-muted">
          {dict.manager.stations.empty}
        </p>
      ) : (
        stations.map((station) => (
          <StationEditor
            key={station.id}
            station={station}
            locationId={locationId}
            lang={lang}
            dict={dict}
            locale={locale}
          />
        ))
      )}
    </div>
  );
}
