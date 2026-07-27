"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  ClipboardList,
  FileSignature,
  Scale,
  Shield,
  UserCheck,
  Bell,
} from "lucide-react";
import {
  logDisciplinaryAction,
  sendConventionRemindersAction,
} from "@/lib/actions/workplace-convention";
import type { ManagerConventionReport } from "@/lib/data/workplace-convention";
import type { WorkplaceInfractionCode } from "@/lib/policy/workplace-convention";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { DisciplineStep } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.convention.manager.errors.unauthorized,
    facts_too_short: dict.convention.manager.errors.factsTooShort,
    employee_not_found: dict.convention.manager.errors.employeeNotFound,
    no_location: dict.convention.manager.errors.noLocation,
    database_error: dict.convention.manager.errors.databaseError,
  };
  return map[code] ?? dict.convention.manager.errors.databaseError;
}

function stepLabel(dict: Dictionary, step: DisciplineStep) {
  const map: Record<DisciplineStep, string> = {
    VERBAL_COACHING: dict.convention.manager.steps.verbal,
    WRITTEN_FIRST: dict.convention.manager.steps.writtenFirst,
    WRITTEN_SECOND_SUSPENSION: dict.convention.manager.steps.writtenSecond,
    TERMINATION: dict.convention.manager.steps.termination,
    GROSS_MISCONDUCT: dict.convention.manager.steps.gross,
  };
  return map[step] ?? step;
}

function stepTone(step: DisciplineStep): "neutral" | "accent" | "warning" | "danger" {
  if (step === "VERBAL_COACHING") return "neutral";
  if (step === "WRITTEN_FIRST") return "accent";
  if (step === "WRITTEN_SECOND_SUSPENSION") return "warning";
  return "danger";
}

function formatDate(iso: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

export function ManagerConventionDashboard({
  lang,
  dict,
  report,
}: {
  lang: Locale;
  dict: Dictionary;
  report: ManagerConventionReport;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"roster" | "discipline" | "history">("roster");
  const [employeeId, setEmployeeId] = useState(report.roster[0]?.userId ?? "");
  const [infractionCode, setInfractionCode] = useState<WorkplaceInfractionCode>("LATE_UNNOTIFIED");
  const [facts, setFacts] = useState("");
  const [managerNotes, setManagerNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [remindError, setRemindError] = useState<string | null>(null);
  const [remindSuccess, setRemindSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isReminding, startRemind] = useTransition();

  const pendingCount = report.totalEmployees - report.signedCount;

  const participationPct = report.totalEmployees
    ? Math.round((report.signedCount / report.totalEmployees) * 100)
    : 0;

  const selectedInfraction = useMemo(
    () => report.infractionOptions.find((o) => o.code === infractionCode),
    [report.infractionOptions, infractionCode],
  );

  function submitDiscipline() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await logDisciplinaryAction({
        employeeId,
        infractionCode,
        facts,
        managerNotes: managerNotes || undefined,
        lang,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setFacts("");
      setManagerNotes("");
      setSuccess(
        dict.convention.manager.logSuccess.replace(
          "{step}",
          result.step ? stepLabel(dict, result.step) : "",
        ),
      );
      router.refresh();
    });
  }

  function sendReminders() {
    setRemindError(null);
    setRemindSuccess(null);
    startRemind(async () => {
      const result = await sendConventionRemindersAction(lang);
      if (!result.ok) {
        const map: Record<string, string> = {
          unauthorized: dict.convention.manager.remindErrors.unauthorized,
          all_signed: dict.convention.manager.remindErrors.allSigned,
          cooldown: dict.convention.manager.remindErrors.cooldown,
          no_location: dict.convention.manager.remindErrors.noLocation,
          database_error: dict.convention.manager.remindErrors.databaseError,
        };
        setRemindError(map[result.error] ?? dict.convention.manager.remindErrors.databaseError);
        return;
      }
      setRemindSuccess(
        dict.convention.manager.remindSuccess.replace("{count}", String(result.dmCount)),
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <Link
          href={`/${lang}/settings/manager`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {dict.settings.manager}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-accent" aria-hidden />
              <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">{dict.convention.manager.title}</h1>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">{dict.convention.manager.subtitle}</p>
          </div>
          <Badge tone="accent">
            {dict.convention.versionLabel.replace("{version}", report.version)}
          </Badge>
        </div>
      </header>

      <div className="grid gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6">
        <article className="premium-card p-4">
          <p className="text-xs text-foreground-muted">{dict.convention.manager.kpiSigned}</p>
          <p className="metric mt-1 text-2xl font-bold">
            {report.signedCount}
            <span className="text-base font-normal text-foreground-muted"> / {report.totalEmployees}</span>
          </p>
          <p className="metric mt-1 text-xs text-success">{participationPct}%</p>
        </article>
        <article className="premium-card p-4">
          <p className="text-xs text-foreground-muted">{dict.convention.manager.kpiPending}</p>
          <p className="metric mt-1 text-2xl font-bold">{report.totalEmployees - report.signedCount}</p>
        </article>
        <article className="premium-card p-4">
          <p className="text-xs text-foreground-muted">{dict.convention.manager.kpiRecords}</p>
          <p className="metric mt-1 text-2xl font-bold">{report.recentRecords.length}</p>
        </article>
      </div>

      <div className="flex gap-2 border-b border-border px-4 sm:px-6">
        {(
          [
            { id: "roster" as const, label: dict.convention.manager.tabRoster, icon: UserCheck },
            { id: "discipline" as const, label: dict.convention.manager.tabDiscipline, icon: ClipboardList },
            { id: "history" as const, label: dict.convention.manager.tabHistory, icon: Shield },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              tab === id
                ? "border-accent text-accent"
                : "border-transparent text-foreground-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-6 sm:px-6">
        {tab === "roster" && (
          <div className="space-y-4">
            {pendingCount > 0 && (
              <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {dict.convention.manager.kpiPending}: {pendingCount}
                  </p>
                  {remindSuccess && (
                    <p className="mt-1 text-xs text-success">{remindSuccess}</p>
                  )}
                  {remindError && <p className="mt-1 text-xs text-danger">{remindError}</p>}
                </div>
                <Button
                  type="button"
                  disabled={isReminding}
                  onClick={sendReminders}
                  className="shrink-0"
                >
                  <Bell className="mr-2 h-4 w-4" aria-hidden />
                  {isReminding
                    ? dict.convention.manager.reminding
                    : dict.convention.manager.remindCta}
                </Button>
              </div>
            )}
            <ul className="space-y-2">
            {report.roster.map((member) => (
              <li
                key={member.userId}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: member.stationColorHex ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-medium">{member.fullName}</p>
                    {member.signed && member.signedAt && (
                      <p className="text-xs text-foreground-muted">
                        {dict.convention.signedAs
                          .replace("{name}", member.signatureName ?? "")
                          .replace("{date}", formatDate(member.signedAt, lang))}
                      </p>
                    )}
                  </div>
                </div>
                {member.signed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {dict.convention.manager.rosterSigned}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                    <FileSignature className="h-3.5 w-3.5" aria-hidden />
                    {dict.convention.manager.rosterPending}
                  </span>
                )}
              </li>
            ))}
            </ul>
          </div>
        )}

        {tab === "discipline" && (
          <div className="mx-auto max-w-xl space-y-4">
            <p className="text-sm text-foreground-muted">{dict.convention.manager.disciplineHint}</p>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">
                {dict.convention.manager.employeeLabel}
              </span>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              >
                {report.roster.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">
                {dict.convention.manager.infractionLabel}
              </span>
              <select
                value={infractionCode}
                onChange={(e) => setInfractionCode(e.target.value as WorkplaceInfractionCode)}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              >
                {report.infractionOptions.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                    {opt.isGross ? ` (${dict.convention.manager.grossTag})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedInfraction?.isGross && (
              <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {dict.convention.manager.grossWarning}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">
                {dict.convention.manager.factsLabel}
              </span>
              <textarea
                value={facts}
                onChange={(e) => setFacts(e.target.value)}
                rows={4}
                placeholder={dict.convention.manager.factsPlaceholder}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">
                {dict.convention.manager.notesLabel}
              </span>
              <textarea
                value={managerNotes}
                onChange={(e) => setManagerNotes(e.target.value)}
                rows={2}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}
            {success && <p className="text-sm text-success">{success}</p>}

            <Button className="w-full" disabled={isPending || facts.trim().length < 10} onClick={submitDiscipline}>
              {isPending ? dict.convention.manager.logging : dict.convention.manager.logCta}
            </Button>
          </div>
        )}

        {tab === "history" && (
          <ul className="space-y-3">
            {report.recentRecords.length === 0 ? (
              <p className="text-sm text-foreground-muted">{dict.convention.manager.noRecords}</p>
            ) : (
              report.recentRecords.map((record) => (
                <li key={record.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{record.infractionLabel}</p>
                    <Badge tone={stepTone(record.disciplineStep)}>
                      {stepLabel(dict, record.disciplineStep)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-foreground-muted">{record.facts}</p>
                  {record.managerScript && (
                    <p className="mt-2 rounded-lg bg-accent-muted px-3 py-2 text-xs italic text-accent">
                      {record.managerScript}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-foreground-muted">
                    {formatDate(record.occurredAt, lang)} · {record.managerName}
                    {record.requiresEmployeeSignature && !record.employeeSignedAt && (
                      <span className="ml-2 text-warning"> · {dict.convention.manager.awaitingSignature}</span>
                    )}
                    {record.employeeSignedAt && (
                      <span className="ml-2 text-success"> · {dict.convention.manager.employeeSigned}</span>
                    )}
                  </p>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
