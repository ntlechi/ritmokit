"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { updateStaffingProfileAction } from "@/lib/actions/staffing";
import type { StaffingProfileSnapshot } from "@/lib/scheduling/staffing-curve-core";
import { stationLabel, type StationRecord } from "@/lib/stations/display";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.manager.staffing.errors.unauthorized,
    invalid_students_per_hour: dict.manager.staffing.errors.invalidStudentsPerHour,
    invalid_share: dict.manager.staffing.errors.invalidShare,
    invalid_headcount: dict.manager.staffing.errors.invalidHeadcount,
    database_error: dict.manager.staffing.errors.databaseError,
  };
  return map[code] ?? dict.manager.staffing.errors.databaseError;
}

function profilesFromForm(
  stations: StationRecord[],
  form: Record<string, { studentsPerHour: string; classMixSharePercent: string; minHeadcount: string; maxHeadcount: string }>,
): Record<string, StaffingProfileSnapshot> {
  const result: Record<string, StaffingProfileSnapshot> = {};
  for (const station of stations) {
    const row = form[station.id];
    result[station.id] = {
      stationId: station.id,
      studentsPerHour: Number(row.studentsPerHour) || 1,
      classMixSharePercent: Number(row.classMixSharePercent) || 0,
      minHeadcount: Number(row.minHeadcount) || 0,
      maxHeadcount: Number(row.maxHeadcount) || 1,
    };
  }
  return result;
}

export function StaffingTargetsSidebar({
  open,
  onClose,
  stations,
  initialProfiles,
  dict,
  locale,
  onPreviewChange,
}: {
  open: boolean;
  onClose: () => void;
  stations: StationRecord[];
  initialProfiles: Record<string, StaffingProfileSnapshot>;
  dict: Dictionary;
  locale: Locale;
  onPreviewChange: (profiles: Record<string, StaffingProfileSnapshot>) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [form, setForm] = useState(() =>
    Object.fromEntries(
      stations.map((station) => [
        station.id,
        {
          studentsPerHour: String(initialProfiles[station.id]?.studentsPerHour ?? 0),
          classMixSharePercent: String(initialProfiles[station.id]?.classMixSharePercent ?? 0),
          minHeadcount: String(initialProfiles[station.id]?.minHeadcount ?? 0),
          maxHeadcount: String(initialProfiles[station.id]?.maxHeadcount ?? 1),
        },
      ]),
    ) as Record<string, { studentsPerHour: string; classMixSharePercent: string; minHeadcount: string; maxHeadcount: string }>,
  );

  useEffect(() => {
    if (!open) return;
    onPreviewChange(profilesFromForm(stations, form));
  }, [form, open, onPreviewChange, stations]);

  function updateField(
    stationId: string,
    field: keyof (typeof form)[string],
    value: string,
  ) {
    setForm((prev) => ({ ...prev, [stationId]: { ...prev[stationId], [field]: value } }));
    setStatus(null);
  }

  function handleApply() {
    setStatus(null);
    startTransition(async () => {
      for (const station of stations) {
        const row = form[station.id];
        const result = await updateStaffingProfileAction({
          stationId: station.id,
          studentsPerHour: Number(row.studentsPerHour),
          classMixSharePercent: Number(row.classMixSharePercent),
          minHeadcount: Number(row.minHeadcount),
          maxHeadcount: Number(row.maxHeadcount),
        });
        if (!result.ok) {
          setStatus({ tone: "danger", text: resolveError(dict, result.error) });
          return;
        }
      }
      setStatus({ tone: "success", text: dict.schedule.sidebarSaved });
      router.refresh();
    });
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-zinc-950/50 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-200/80 bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-white/10 dark:bg-zinc-900",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold">{dict.schedule.sidebarTitle}</h2>
              <p className="text-xs text-foreground-muted">{dict.schedule.sidebarSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-foreground-muted hover:bg-zinc-100 dark:hover:bg-white/5"
            aria-label={dict.common.cancel}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-foreground-muted">{dict.schedule.sidebarLiveHint}</p>
          <div className="flex flex-col gap-4">
            {stations.map((station) => (
              <div key={station.id} className="rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5">
                <h3 className="text-sm font-medium">{stationLabel(station, locale)}</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-[11px] text-foreground-muted">
                    {dict.manager.staffing.studentsPerHour}
                    <input
                      type="number"
                      min={1}
                      step="0.5"
                      value={form[station.id].studentsPerHour}
                      onChange={(e) => updateField(station.id, "studentsPerHour", e.target.value)}
                      className="rounded-lg border border-zinc-200/80 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900/60"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-foreground-muted">
                    {dict.manager.staffing.classMixShare}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form[station.id].classMixSharePercent}
                      onChange={(e) => updateField(station.id, "classMixSharePercent", e.target.value)}
                      className="rounded-lg border border-zinc-200/80 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900/60"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-foreground-muted">
                    {dict.manager.staffing.minHeadcount}
                    <input
                      type="number"
                      min={0}
                      value={form[station.id].minHeadcount}
                      onChange={(e) => updateField(station.id, "minHeadcount", e.target.value)}
                      className="rounded-lg border border-zinc-200/80 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900/60"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-foreground-muted">
                    {dict.manager.staffing.maxHeadcount}
                    <input
                      type="number"
                      min={0}
                      value={form[station.id].maxHeadcount}
                      onChange={(e) => updateField(station.id, "maxHeadcount", e.target.value)}
                      className="rounded-lg border border-zinc-200/80 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900/60"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex items-center gap-2 border-t border-zinc-200/80 px-5 py-4 dark:border-white/10">
          <button
            type="button"
            onClick={handleApply}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden />
            {isPending ? dict.manager.staffing.saving : dict.schedule.sidebarApply}
          </button>
          {status && (
            <span className={cn("text-xs", status.tone === "success" ? "text-success" : "text-danger")}>
              {status.text}
            </span>
          )}
        </footer>
      </aside>
    </>
  );
}
