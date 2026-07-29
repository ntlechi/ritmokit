"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, Download, FileSpreadsheet, Lock, LockOpen } from "lucide-react";
import { lockPayPeriodAction, generatePayrollExportAction } from "@/lib/actions/payroll";
import type { PayPeriodDetail } from "@/lib/data/payroll";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { PayrollExportFormat } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function formatDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function resolveError(dict: Dictionary, code: string) {
  const map = dict.manager.payroll.errors as Record<string, string>;
  return map[code] ?? dict.manager.payroll.errors.databaseError;
}

export function PayrollPeriodDetail({
  lang,
  dict,
  detail,
}: {
  lang: Locale;
  dict: Dictionary;
  detail: PayPeriodDetail;
}) {
  const router = useRouter();
  const d = dict.manager.payroll;
  const dd = d.detail;

  const [lockError, setLockError] = useState<string | null>(null);
  const [isLockPending, startLockTransition] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<PayrollExportFormat | null>(null);
  const [isExportPending, startExportTransition] = useTransition();

  const isLocked = detail.status === "LOCKED";
  const hasWarnings = detail.warnings.length > 0;

  function handleLock() {
    if (!window.confirm(dd.lockConfirm)) return;
    setLockError(null);
    startLockTransition(async () => {
      const result = await lockPayPeriodAction(detail.id);
      if (!result.ok) {
        setLockError(resolveError(dict, result.error));
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function handleExport(format: PayrollExportFormat) {
    setExportError(null);
    setExportingFormat(format);
    startExportTransition(async () => {
      const result = await generatePayrollExportAction(detail.id, format);
      if (!result.ok) {
        setExportError(resolveError(dict, result.error));
        setExportingFormat(null);
        return;
      }
      window.location.href = `/api/payroll/export/${result.exportId}`;
      setExportingFormat(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/${lang}/settings/manager/payroll`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
            aria-label={d.backToList}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              {dd.periodLabel
                .replace("{start}", formatDate(detail.startDate, lang))
                .replace("{end}", formatDate(detail.endDate, lang))}
            </h1>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-foreground-muted">
              {isLocked ? (
                <Lock className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              ) : (
                <LockOpen className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              )}
              <Badge tone={isLocked ? "success" : "accent"}>{isLocked ? d.statusLocked : d.statusOpen}</Badge>
              {isLocked && detail.lockedAt && detail.lockedByName && (
                <span>
                  {dd.lockedInfo
                    .replace("{date}", formatDateTime(detail.lockedAt, lang))
                    .replace("{name}", detail.lockedByName)}
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-base font-semibold">{dd.totalsTitle}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl bg-surface-muted px-3 py-2">
              <dt className="text-xs text-foreground-muted">{dd.regularHours}</dt>
              <dd className="metric mt-0.5 text-lg font-semibold">{detail.totals.regularHours.toFixed(1)}</dd>
            </div>
            <div className="rounded-xl bg-surface-muted px-3 py-2">
              <dt className="text-xs text-foreground-muted">{dd.overtimeHours}</dt>
              <dd className="metric mt-0.5 text-lg font-semibold text-warning">
                {detail.totals.overtimeHours.toFixed(1)}
              </dd>
            </div>
            <div className="rounded-xl bg-surface-muted px-3 py-2">
              <dt className="text-xs text-foreground-muted">{dd.regularPay}</dt>
              <dd className="metric mt-0.5 text-lg font-semibold">{detail.totals.regularPay.toFixed(2)}$</dd>
            </div>
            <div className="rounded-xl bg-surface-muted px-3 py-2">
              <dt className="text-xs text-foreground-muted">{dd.overtimePay}</dt>
              <dd className="metric mt-0.5 text-lg font-semibold text-warning">
                {detail.totals.overtimePay.toFixed(2)}$
              </dd>
            </div>
            <div className="rounded-xl bg-accent/10 px-3 py-2">
              <dt className="text-xs text-accent">{dd.grossPay}</dt>
              <dd className="metric mt-0.5 text-lg font-semibold text-accent">
                {detail.totals.grossPay.toFixed(2)}$
              </dd>
            </div>
          </dl>
        </section>

        {!isLocked && hasWarnings && (
          <section className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              <h2 className="text-base font-semibold">{dd.warningsTitle}</h2>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {detail.warnings.map((warning, index) => (
                <li key={index} className="text-foreground-muted">
                  {warning.type === "missing_punch"
                    ? dd.warningMissingPunch
                        .replace("{name}", warning.fullName)
                        .replace("{date}", formatDate(warning.shiftDate, lang))
                    : dd.warningMissingRate.replace("{name}", warning.fullName)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-warning">{dd.warningsBlockLock}</p>
          </section>
        )}

        {!isLocked && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            {lockError && (
              <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {lockError}
              </p>
            )}
            <Button
              variant="primary"
              size="md"
              disabled={isLockPending || hasWarnings || detail.lines.length === 0}
              onClick={handleLock}
            >
              <Lock className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {isLockPending ? dd.locking : dd.lockButton}
            </Button>
          </section>
        )}

        {isLocked && (
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />
              <h2 className="text-base font-semibold">{dd.exportsTitle}</h2>
            </div>

            {exportError && (
              <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {exportError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                size="md"
                disabled={isExportPending}
                onClick={() => handleExport("NETHRIS")}
              >
                {isExportPending && exportingFormat === "NETHRIS" ? dd.exporting : dd.exportNethris}
              </Button>
              <Button
                variant="secondary"
                size="md"
                disabled={isExportPending}
                onClick={() => handleExport("PAYWORKS")}
              >
                {isExportPending && exportingFormat === "PAYWORKS" ? dd.exporting : dd.exportPayworks}
              </Button>
            </div>

            <div className="mt-5">
              <p className="text-xs font-medium text-foreground-muted">{dd.exportHistoryTitle}</p>
              {detail.exports.length === 0 ? (
                <p className="mt-2 text-sm text-foreground-muted">{dd.noExportsYet}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {detail.exports.map((exp) => (
                    <li
                      key={exp.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-muted px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{exp.fileName}</p>
                        <p className="text-xs text-foreground-muted">
                          {dd.exportedOn.replace("{date}", formatDateTime(exp.exportedAt, lang)).replace(
                            "{name}",
                            exp.exportedByName,
                          )}
                        </p>
                      </div>
                      <a
                        href={`/api/payroll/export/${exp.id}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        {dd.download}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-base font-semibold">{dd.employeesTitle}</h2>
          {detail.lines.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center text-sm text-foreground-muted">
              {dd.emptyEmployees}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-foreground-muted">
                    <th className="px-4 py-2.5 font-medium">{dd.colEmployee}</th>
                    <th className="px-4 py-2.5 font-medium">{dd.colStation}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{dd.colRate}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{dd.colRegular}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{dd.colOvertime}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{dd.colGross}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{dd.colShifts}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.userId} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{line.fullName}</td>
                      <td className="px-4 py-2.5 text-foreground-muted">{line.stationNameFr}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{line.hourlyRate.toFixed(2)}$</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{line.regularHours.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-warning">
                        {line.overtimeHours > 0 ? line.overtimeHours.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {line.grossPay.toFixed(2)}$
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                        {line.shiftCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
