import Link from "next/link";
import { AlertTriangle, ArrowLeft, Coffee, TrendingUp, User } from "lucide-react";
import type { AssiduityAlert, ManagerAssiduityReport, ReplacementStatus } from "@/lib/data/assiduity";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BREAK_VIOLATIONS = new Set(["MISSED_BREAK", "SHORT_BREAK"]);

function isBreakViolation(policyViolation: string) {
  return BREAK_VIOLATIONS.has(policyViolation);
}

function breakViolationBadgeLabel(dict: Dictionary, policyViolation: string) {
  return policyViolation === "MISSED_BREAK"
    ? dict.manager.assiduity.missedBreakBadge
    : dict.manager.assiduity.shortBreakBadge;
}

function formatShiftDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

function formatLoggedAt(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}

function replacementLabel(dict: Dictionary, status: ReplacementStatus) {
  const map: Record<ReplacementStatus, string> = {
    confirmed: dict.manager.assiduity.replacement.confirmed,
    pending: dict.manager.assiduity.replacement.pending,
    matched: dict.manager.assiduity.replacement.matched,
    unresolved: dict.manager.assiduity.replacement.unresolved,
    none: dict.manager.assiduity.replacement.none,
  };
  return map[status];
}

function replacementTone(status: ReplacementStatus): "success" | "warning" | "danger" | "neutral" | "accent" {
  if (status === "confirmed") return "success";
  if (status === "pending" || status === "matched") return "accent";
  if (status === "unresolved") return "danger";
  return "neutral";
}

function TeamAssiduityGauge({
  dict,
  summary,
}: {
  dict: Dictionary;
  summary: ManagerAssiduityReport["summary"];
}) {
  const onTarget = summary.currentRate >= summary.targetRate;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{dict.manager.assiduity.teamRate}</h2>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            {dict.manager.assiduity.periodLabel.replace("{days}", String(summary.periodDays))}
          </p>
        </div>
        <div className="text-right">
          <p className="metric text-3xl font-semibold tracking-tight">{summary.currentRate}%</p>
          <p className="text-xs text-foreground-muted">
            {dict.manager.assiduity.targetLabel}: {summary.targetRate}%
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="relative h-3 overflow-hidden rounded-full bg-surface-muted">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              onTarget ? "bg-success" : "bg-warning",
            )}
            style={{ width: `${summary.currentRate}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/30"
            style={{ left: `${summary.targetRate}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-foreground-muted">
          <span>
            {summary.highAlertCount} {dict.manager.assiduity.alertCount}
          </span>
          <span>
            {summary.totalShiftsWindow} {dict.manager.assiduity.shiftsTracked}
          </span>
        </div>
      </div>
    </section>
  );
}

function AssiduityAlertCard({
  alert,
  dict,
  lang,
}: {
  alert: AssiduityAlert;
  dict: Dictionary;
  lang: Locale;
}) {
  const breakViolation = isBreakViolation(alert.policyViolation);

  return (
    <article
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        breakViolation ? "border-warning/20 bg-warning/5" : "border-danger/20 bg-danger/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              breakViolation ? "bg-warning/10" : "bg-danger/10",
            )}
          >
            {breakViolation ? (
              <Coffee className="h-4 w-4 text-warning" aria-hidden />
            ) : (
              <User className="h-4 w-4 text-danger" aria-hidden />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">{alert.employeeName}</p>
            <p className="text-xs text-foreground-muted">{formatLoggedAt(alert.createdAt, lang)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {breakViolation && (
            <Badge tone="warning">{breakViolationBadgeLabel(dict, alert.policyViolation)}</Badge>
          )}
          <Badge tone="danger">{dict.manager.assiduity.severityHigh}</Badge>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-foreground-muted">{dict.manager.assiduity.shiftDate}</dt>
          <dd className="mt-0.5 text-sm font-medium">{formatShiftDate(alert.shiftDate, lang)}</dd>
        </div>
        {breakViolation ? (
          <div>
            <dt className="text-xs font-medium text-foreground-muted">{dict.manager.assiduity.breakDurationLabel}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">
              {dict.manager.assiduity.breakDurationValue
                .replace("{taken}", String(alert.breakTakenMinutes ?? 0))
                .replace("{required}", String(alert.breakRequiredMinutes ?? 30))}
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs font-medium text-foreground-muted">{dict.manager.assiduity.replacementStatus}</dt>
            <dd className="mt-1">
              <Badge tone={replacementTone(alert.replacementStatus)}>
                {replacementLabel(dict, alert.replacementStatus)}
              </Badge>
              {alert.replacementCandidate && (
                <p className="mt-1 text-xs text-foreground-muted">→ {alert.replacementCandidate}</p>
              )}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3 rounded-xl border border-border/60 bg-surface px-3 py-2">
        <p className="text-xs font-medium text-foreground-muted">
          {breakViolation ? dict.manager.assiduity.breakViolationTitle : dict.manager.assiduity.shortNotice}
        </p>
        {alert.motive ? (
          <p className="mt-1 text-sm leading-relaxed">{alert.motive}</p>
        ) : (
          <p className="mt-1 text-sm text-foreground-muted italic">{dict.manager.assiduity.noMotive}</p>
        )}
      </div>
    </article>
  );
}

export function AssiduityDashboard({
  lang,
  dict,
  report,
}: {
  lang: Locale;
  dict: Dictionary;
  report: ManagerAssiduityReport;
}) {
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
            <h1 className="text-xl font-semibold tracking-tight">{dict.manager.assiduity.title}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {report.locationName} · {dict.manager.assiduity.subtitle}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 py-5 sm:px-6">
        <TeamAssiduityGauge dict={dict} summary={report.summary} />

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
            <h2 className="text-base font-semibold">{dict.manager.assiduity.highAlertsTitle}</h2>
          </div>

          {report.alerts.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface-muted px-6 py-10 text-center text-sm text-foreground-muted">
              {dict.manager.assiduity.emptyAlerts}
            </p>
          ) : (
            report.alerts.map((alert) => (
              <AssiduityAlertCard key={alert.id} alert={alert} dict={dict} lang={lang} />
            ))
          )}
        </section>
      </main>
    </div>
  );
}
