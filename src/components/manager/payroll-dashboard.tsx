"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, ChevronRight, Lock, LockOpen, Plus } from "lucide-react";
import { createPayPeriodAction, deleteOpenPayPeriodAction } from "@/lib/actions/payroll";
import type { PayPeriodSummary } from "@/lib/data/payroll";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DURATION_OPTIONS = [1, 2, 3, 4] as const;

function formatPeriodDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function toDateInputValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Dimanche le plus récent (≤ aujourd'hui) suivant le dernier jour connu — sert
 * de valeur par défaut au formulaire de création pour éviter que le gérant
 * doive deviner une date valide. */
function computeDefaultStartDate(periods: PayPeriodSummary[]): Date {
  if (periods.length > 0) {
    const latestEnd = periods.reduce(
      (latest, p) => (p.endDate > latest ? p.endDate : latest),
      periods[0].endDate,
    );
    const next = new Date(latestEnd);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  utcToday.setUTCDate(utcToday.getUTCDate() - utcToday.getUTCDay());
  return utcToday;
}

function resolveError(dict: Dictionary, code: string) {
  const map = dict.manager.payroll.errors as Record<string, string>;
  return map[code] ?? dict.manager.payroll.errors.databaseError;
}

function statusTone(status: PayPeriodSummary["status"]): "accent" | "success" {
  return status === "LOCKED" ? "success" : "accent";
}

export function ManagerPayrollDashboard({
  lang,
  dict,
  periods,
}: {
  lang: Locale;
  dict: Dictionary;
  periods: PayPeriodSummary[];
}) {
  const router = useRouter();
  const d = dict.manager.payroll;

  const defaultStart = useMemo(() => computeDefaultStartDate(periods), [periods]);
  const [startDateValue, setStartDateValue] = useState(toDateInputValue(defaultStart));
  const [durationWeeks, setDurationWeeks] = useState<(typeof DURATION_OPTIONS)[number]>(2);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();

  const previewEndDate = useMemo(() => {
    const start = new Date(`${startDateValue}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + durationWeeks * 7 - 1);
    return end;
  }, [startDateValue, durationWeeks]);

  const startIsSunday = useMemo(() => {
    const start = new Date(`${startDateValue}T00:00:00Z`);
    return !Number.isNaN(start.getTime()) && start.getUTCDay() === 0;
  }, [startDateValue]);

  function createPeriod() {
    setError(null);
    if (!previewEndDate) {
      setError(d.errors.invalidDate);
      return;
    }
    startTransition(async () => {
      const result = await createPayPeriodAction(startDateValue, toDateInputValue(previewEndDate));
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      router.push(`/${lang}/settings/manager/payroll/${result.payPeriodId}`);
    });
  }

  function deletePeriod(periodId: string) {
    if (!window.confirm(d.deleteConfirm)) return;
    setError(null);
    setDeletingId(periodId);
    startDeleteTransition(async () => {
      const result = await deleteOpenPayPeriodAction(periodId);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        setDeletingId(null);
        return;
      }
      setDeletingId(null);
      router.refresh();
    });
  }

  const durationLabels: Record<(typeof DURATION_OPTIONS)[number], string> = {
    1: d.duration1Week,
    2: d.duration2Weeks,
    3: d.duration3Weeks,
    4: d.duration4Weeks,
  };

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
            <h1 className="text-xl font-semibold tracking-tight">{d.title}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">{d.subtitle}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{d.createTitle}</h2>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">{d.createSubtitle}</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{d.startDateLabel}</span>
              <input
                type="date"
                value={startDateValue}
                onChange={(e) => setStartDateValue(e.target.value)}
                className="h-10 rounded-xl border border-border bg-surface-muted px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{d.durationLabel}</span>
              <select
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(Number(e.target.value) as (typeof DURATION_OPTIONS)[number])}
                className="h-10 rounded-xl border border-border bg-surface-muted px-3 text-sm"
              >
                {DURATION_OPTIONS.map((weeks) => (
                  <option key={weeks} value={weeks}>
                    {durationLabels[weeks]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!startIsSunday && (
            <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              {d.errors.mustStartSunday}
            </p>
          )}
          <p className="mt-3 text-xs text-foreground-muted">{d.startDateHint}</p>

          {previewEndDate && (
            <p className="mt-3 rounded-xl bg-surface-muted px-4 py-3 text-sm">
              <CalendarClock className="mr-1.5 inline h-3.5 w-3.5 text-accent" aria-hidden />
              {formatPeriodDate(startDateValue, lang)} → {formatPeriodDate(toDateInputValue(previewEndDate), lang)}
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <Button
            variant="primary"
            size="md"
            className="mt-4 w-full sm:w-auto"
            disabled={isPending || !startIsSunday}
            onClick={createPeriod}
          >
            {isPending ? d.creating : d.createButton}
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">{d.periodsTitle}</h2>
          {periods.length === 0 && (
            <p className="rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center text-sm text-foreground-muted">
              {d.noPeriods}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {periods.map((period) => (
              <li
                key={period.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm transition-colors hover:border-accent/30"
              >
                <Link
                  href={`/${lang}/settings/manager/payroll/${period.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  {period.status === "LOCKED" ? (
                    <Lock className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <LockOpen className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {formatPeriodDate(period.startDate, lang)} → {formatPeriodDate(period.endDate, lang)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                      <Badge tone={statusTone(period.status)}>
                        {period.status === "LOCKED" ? d.statusLocked : d.statusOpen}
                      </Badge>
                      {period.status === "LOCKED" && (
                        <>
                          <span>
                            {period.lineItemCount} {d.employeesLabel}
                          </span>
                          <span className="font-medium tabular-nums text-foreground">
                            {period.totalGrossPay.toFixed(2)}$
                          </span>
                          {period.exportCount > 0 && (
                            <span>
                              {period.exportCount} {d.exportsLabel}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {period.status === "OPEN" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isDeletePending && deletingId === period.id}
                      onClick={() => deletePeriod(period.id)}
                    >
                      {isDeletePending && deletingId === period.id ? d.deleting : d.deleteButton}
                    </Button>
                  )}
                  <Link
                    href={`/${lang}/settings/manager/payroll/${period.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
                    aria-label={d.viewDetails}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
