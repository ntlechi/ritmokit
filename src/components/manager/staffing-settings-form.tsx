"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updateStaffingProfileAction } from "@/lib/actions/staffing";
import type { StaffingProfileSnapshot } from "@/lib/scheduling/staffing-curve-core";
import { stationLabel, type StationRecord } from "@/lib/stations/display";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.manager.staffing.errors.unauthorized,
    invalid_splh: dict.manager.staffing.errors.invalidSplh,
    invalid_share: dict.manager.staffing.errors.invalidShare,
    invalid_headcount: dict.manager.staffing.errors.invalidHeadcount,
    database_error: dict.manager.staffing.errors.databaseError,
  };
  return map[code] ?? dict.manager.staffing.errors.databaseError;
}

function StationRow({
  station,
  profile,
  dict,
  locale,
}: {
  station: StationRecord;
  profile: StaffingProfileSnapshot;
  dict: Dictionary;
  locale: Locale;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    targetSplh: String(profile.targetSplh),
    salesSharePercent: String(profile.salesSharePercent),
    minHeadcount: String(profile.minHeadcount),
    maxHeadcount: String(profile.maxHeadcount),
  });
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  function handleSave() {
    setStatus(null);
    startTransition(async () => {
      const result = await updateStaffingProfileAction({
        stationId: station.id,
        targetSplh: Number(values.targetSplh),
        salesSharePercent: Number(values.salesSharePercent),
        minHeadcount: Number(values.minHeadcount),
        maxHeadcount: Number(values.maxHeadcount),
      });
      if (!result.ok) {
        setStatus({ tone: "danger", text: resolveError(dict, result.error) });
        return;
      }
      setStatus({ tone: "success", text: dict.manager.staffing.saveSuccess });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{stationLabel(station, locale)}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.staffing.targetSplh}
          <input
            type="number"
            min={1}
            step="0.5"
            value={values.targetSplh}
            onChange={(e) => setValues((v) => ({ ...v, targetSplh: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.staffing.salesShare}
          <input
            type="number"
            min={0}
            max={100}
            step="1"
            value={values.salesSharePercent}
            onChange={(e) => setValues((v) => ({ ...v, salesSharePercent: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.staffing.minHeadcount}
          <input
            type="number"
            min={0}
            step="1"
            value={values.minHeadcount}
            onChange={(e) => setValues((v) => ({ ...v, minHeadcount: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          {dict.manager.staffing.maxHeadcount}
          <input
            type="number"
            min={0}
            step="1"
            value={values.maxHeadcount}
            onChange={(e) => setValues((v) => ({ ...v, maxHeadcount: e.target.value }))}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
      </div>
      <p className="text-xs text-foreground-muted">{dict.manager.staffing.targetSplhHint}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {isPending ? dict.manager.staffing.saving : dict.manager.staffing.save}
        </button>
        {status && (
          <span className={cn("text-xs", status.tone === "success" ? "text-success" : "text-danger")}>
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}

export function StaffingSettingsForm({
  stations,
  profiles,
  dict,
  locale,
}: {
  stations: StationRecord[];
  profiles: Record<string, StaffingProfileSnapshot>;
  dict: Dictionary;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-4">
      {stations.map((station) => (
        <StationRow
          key={station.id}
          station={station}
          profile={profiles[station.id]}
          dict={dict}
          locale={locale}
        />
      ))}
    </div>
  );
}
