"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { correctPunchAction } from "@/lib/actions/punch-admin";
import type { ManagerPunchReport, ManagerPunchRow } from "@/lib/data/punch-admin";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function toInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatShiftDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function formatShiftTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function statusTone(status: ManagerPunchRow["status"]): "success" | "warning" | "danger" | "neutral" | "accent" {
  if (status === "ok") return "success";
  if (status === "missing_in" || status === "missing_out") return "danger";
  if (status === "in_progress") return "accent";
  return "neutral";
}

function statusLabel(dict: Dictionary, status: ManagerPunchRow["status"]) {
  const map: Record<ManagerPunchRow["status"], string> = {
    ok: dict.manager.punches.statusOk,
    missing_in: dict.manager.punches.statusMissingIn,
    missing_out: dict.manager.punches.statusMissingOut,
    in_progress: dict.manager.punches.statusInProgress,
    upcoming: dict.manager.punches.statusUpcoming,
  };
  return map[status];
}

function PunchRowCard({
  row,
  dict,
  lang,
}: {
  row: ManagerPunchRow;
  dict: Dictionary;
  lang: Locale;
}) {
  const [actualIn, setActualIn] = useState(toInputValue(row.actualStartsAt));
  const [actualOut, setActualOut] = useState(toInputValue(row.actualEndsAt));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty =
    actualIn !== toInputValue(row.actualStartsAt) || actualOut !== toInputValue(row.actualEndsAt);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await correctPunchAction(row.shiftId, {
        actualStartsAt: fromInputValue(actualIn),
        actualEndsAt: fromInputValue(actualOut),
      });
      if (!result.ok) {
        const map: Record<string, string> = {
          unauthorized: dict.manager.punches.errors.unauthorized,
          shift_not_found: dict.manager.punches.errors.notFound,
          invalid_range: dict.manager.punches.errors.invalidRange,
          invalid_date: dict.manager.punches.errors.invalidRange,
          database_error: dict.manager.punches.errors.databaseError,
        };
        setError(map[result.error] ?? dict.manager.punches.errors.databaseError);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: row.stationColorHex }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.employeeName}</p>
          <p className="text-xs text-foreground-muted">
            {formatShiftDate(row.startsAt, lang)} · {formatShiftTime(row.startsAt, lang)}–
            {formatShiftTime(row.endsAt, lang)} · {row.stationNameFr}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={statusTone(row.status)}>{statusLabel(dict, row.status)}</Badge>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground-muted">{dict.manager.punches.colActualIn}</span>
          <input
            type="datetime-local"
            value={actualIn}
            onChange={(e) => {
              setActualIn(e.target.value);
              setSaved(false);
            }}
            className="h-9 rounded-lg border border-border bg-surface-muted px-2 text-xs tabular-nums"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-foreground-muted">{dict.manager.punches.colActualOut}</span>
          <input
            type="datetime-local"
            value={actualOut}
            onChange={(e) => {
              setActualOut(e.target.value);
              setSaved(false);
            }}
            className="h-9 rounded-lg border border-border bg-surface-muted px-2 text-xs tabular-nums"
          />
        </label>

        <Button
          type="button"
          variant={dirty ? "primary" : "secondary"}
          size="sm"
          disabled={!dirty || isPending}
          onClick={save}
        >
          {isPending ? dict.manager.punches.saving : saved ? dict.manager.punches.saved : dict.manager.punches.save}
        </Button>
      </div>

      {error && <p className="w-full text-xs text-danger sm:text-right">{error}</p>}
    </li>
  );
}

export function ManagerPunchesDashboard({
  lang,
  dict,
  report,
}: {
  lang: Locale;
  dict: Dictionary;
  report: ManagerPunchReport;
}) {
  const [filterMissingOnly, setFilterMissingOnly] = useState(false);

  const rows = useMemo(
    () => (filterMissingOnly ? report.rows.filter((r) => r.status === "missing_in" || r.status === "missing_out") : report.rows),
    [report.rows, filterMissingOnly],
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/${lang}/settings/manager`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
            aria-label={dict.settings.manager}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.manager.punches.title}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {report.locationName} · {dict.manager.punches.subtitle}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2">
            {report.missingCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            )}
            <p className="text-sm font-medium">
              {report.missingCount > 0
                ? dict.manager.punches.missingCount.replace("{count}", String(report.missingCount))
                : dict.manager.punches.allClear}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilterMissingOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filterMissingOnly
                ? "border-transparent bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border-border bg-surface-muted text-foreground-muted hover:text-foreground",
            )}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {dict.manager.punches.filterMissingOnly}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-foreground-muted">
            {dict.manager.punches.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <PunchRowCard key={row.shiftId} row={row} dict={dict} lang={lang} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
