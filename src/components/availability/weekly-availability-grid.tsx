"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { updateWeeklyAvailability } from "@/lib/actions/availability";
import type { AvailabilitySlot } from "@/lib/data/availability";
import type { TimeOffRequestEntry } from "@/lib/data/timeoff";
import { TimeOffSection } from "@/components/availability/time-off-section";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Affichage lundi → dimanche ; stockage 0=dim … 6=sam (JS). */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

type DayRow = {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

const DEFAULT_START = "07:00";
const DEFAULT_END = "15:00";

function buildInitialRows(slots: AvailabilitySlot[]): DayRow[] {
  const byDay = new Map(slots.map((slot) => [slot.dayOfWeek, slot]));
  return DISPLAY_ORDER.map((dayOfWeek) => {
    const existing = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      enabled: Boolean(existing),
      startTime: existing?.startTime ?? DEFAULT_START,
      endTime: existing?.endTime ?? DEFAULT_END,
    };
  });
}

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    profile_not_found: dict.availability.errors.profileNotFound,
    database_error: dict.availability.errors.databaseError,
    invalid_slot: dict.availability.errors.invalidSlot,
    unauthorized: dict.availability.errors.unauthorized,
  };
  return map[code] ?? dict.availability.errors.databaseError;
}

const timeInputClass =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-50";

export function WeeklyAvailabilityGrid({
  lang,
  dict,
  initialSlots,
  initialTimeOffRequests,
}: {
  lang: Locale;
  dict: Dictionary;
  initialSlots: AvailabilitySlot[];
  initialTimeOffRequests: TimeOffRequestEntry[];
}) {
  const [rows, setRows] = useState<DayRow[]>(() => buildInitialRows(initialSlots));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const enabledCount = useMemo(() => rows.filter((row) => row.enabled).length, [rows]);

  function updateRow(dayOfWeek: number, patch: Partial<DayRow>) {
    setSaved(false);
    setRows((prev) => prev.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)));
  }

  function handleSave() {
    setError(null);
    setSaved(false);

    const payload = rows
      .filter((row) => row.enabled)
      .map((row) => ({
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
      }));

    startTransition(async () => {
      const result = await updateWeeklyAvailability({ lang, availabilities: payload });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/${lang}/settings`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
            aria-label={dict.settings.title}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.availability.title}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">{dict.availability.subtitle}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-3 px-4 py-5 sm:px-6">
        {rows.map((row) => (
          <article
            key={row.dayOfWeek}
            className={cn(
              "rounded-2xl border px-4 py-3 shadow-sm transition",
              row.enabled ? "border-accent/30 bg-accent-muted/40" : "border-border bg-surface",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{dict.availability.days[row.dayOfWeek]}</p>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground-muted">
                <span>{row.enabled ? dict.availability.available : dict.availability.unavailable}</span>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  disabled={isPending}
                  onChange={(event) => updateRow(row.dayOfWeek, { enabled: event.target.checked })}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
              </label>
            </div>

            {row.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground-muted">
                    {dict.availability.startTime}
                  </label>
                  <input
                    type="time"
                    value={row.startTime}
                    disabled={isPending}
                    onChange={(event) => updateRow(row.dayOfWeek, { startTime: event.target.value })}
                    className={timeInputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground-muted">
                    {dict.availability.endTime}
                  </label>
                  <input
                    type="time"
                    value={row.endTime}
                    disabled={isPending}
                    onChange={(event) => updateRow(row.dayOfWeek, { endTime: event.target.value })}
                    className={timeInputClass}
                  />
                </div>
              </div>
            )}
          </article>
        ))}

        <p className="text-center text-xs text-foreground-muted">
          {enabledCount} / {rows.length} {dict.availability.available.toLowerCase()}
        </p>

        {error && <p className="text-center text-sm text-danger">{error}</p>}
        {saved && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" aria-hidden />
            {dict.availability.saved}
          </p>
        )}
      </main>

      <footer className="border-t border-border px-4 py-4 sm:px-6">
        <Button
          variant="primary"
          className="w-full rounded-xl"
          disabled={isPending}
          onClick={handleSave}
        >
          {isPending ? dict.availability.saving : dict.availability.save}
        </Button>
      </footer>

      <TimeOffSection lang={lang} dict={dict} initialRequests={initialTimeOffRequests} />
    </div>
  );
}
