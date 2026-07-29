"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  Fingerprint,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { generateAuditPackageAction } from "@/lib/actions/audit";
import type { AuditPackageSummary } from "@/lib/data/audit";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { AuditType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const AUDIT_TYPES: AuditType[] = ["FULL", "CNESST", "MAPAQ", "FISCAL"];

type DrillStepId =
  | "cnesst_roster"
  | "cnesst_punches"
  | "cnesst_breaks"
  | "mapaq_training"
  | "fiscal_payroll"
  | "seal_manifest"
  | "seal_zip";

const DRILL_STEPS_BY_TYPE: Record<AuditType, DrillStepId[]> = {
  FULL: [
    "cnesst_roster",
    "cnesst_punches",
    "cnesst_breaks",
    "mapaq_training",
    "fiscal_payroll",
    "seal_manifest",
    "seal_zip",
  ],
  CNESST: ["cnesst_roster", "cnesst_punches", "cnesst_breaks", "seal_manifest", "seal_zip"],
  MAPAQ: ["mapaq_training", "seal_manifest", "seal_zip"],
  FISCAL: ["fiscal_payroll", "seal_manifest", "seal_zip"],
};

const DRILL_STEP_MS = 520;

function toDateInputValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  const map = dict.manager.audit.errors as Record<string, string>;
  return map[code] ?? dict.manager.audit.errors.databaseError;
}

/** Affiche un hash SHA-256 en blocs de 8 caractères pour la lisibilité
 * d'un inspecteur — le texte complet reste copiable en un clic. */
function formatHashBlocks(hash: string) {
  return hash.match(/.{1,8}/g)?.join(" ") ?? hash;
}

function SecuritySealCertificate({
  hash,
  dict,
  compact = false,
}: {
  hash: string;
  dict: Dictionary;
  compact?: boolean;
}) {
  const s = dict.manager.audit.seal;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 border-success/25 bg-[#0a0f14] font-mono text-[#c8e6d4] shadow-inner ${
        compact ? "p-3" : "p-4 sm:p-5"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, #22c55e 2px, #22c55e 3px)",
        }}
        aria-hidden
      />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-success/80">{s.title}</p>
              {!compact && <p className="mt-0.5 text-[11px] text-[#8fb89c]">{s.subtitle}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5">
            <Lock className="h-3 w-3 text-success" aria-hidden />
            <span className="text-[10px] font-medium text-success">{dict.manager.audit.seal.statusSealed}</span>
          </div>
        </div>

        <div className="space-y-1 border-t border-success/15 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-[#6b9a7a]">{s.algorithm}</p>
          <p className="text-[10px] uppercase tracking-wider text-[#6b9a7a]">{s.fingerprintLabel}</p>
          <p
            className={`break-all leading-relaxed text-success ${compact ? "text-[11px]" : "text-xs sm:text-sm"}`}
            title={hash}
          >
            {formatHashBlocks(hash)}
          </p>
        </div>

        <button
          type="button"
          onClick={copy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success transition-colors hover:bg-success/20 sm:w-auto"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? dict.manager.audit.copied : s.copyFingerprint}
        </button>
      </div>
    </div>
  );
}

function InspectionDrillProgress({
  steps,
  activeIndex,
  drillComplete,
  dict,
}: {
  steps: DrillStepId[];
  activeIndex: number;
  drillComplete: boolean;
  dict: Dictionary;
}) {
  const d = dict.manager.audit.drill;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-4">
      <div className="flex items-center gap-2">
        <Loader2 className={`h-4 w-4 text-accent ${drillComplete ? "hidden" : "animate-spin"}`} aria-hidden />
        {drillComplete && <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
        <div>
          <p className="text-sm font-semibold">{d.title}</p>
          <p className="text-xs text-foreground-muted">{d.subtitle}</p>
        </div>
      </div>

      <ol className="mt-4 space-y-2" aria-live="polite" aria-busy={!drillComplete}>
        {steps.map((stepId, index) => {
          const isDone = drillComplete || index < activeIndex;
          const isActive = !drillComplete && index === activeIndex;
          const statusLabel = isDone ? d.statusDone : isActive ? d.statusActive : d.statusPending;

          return (
            <li
              key={stepId}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                isActive ? "bg-accent/10" : isDone ? "bg-success/5" : "bg-transparent"
              }`}
            >
              <span className="shrink-0" aria-hidden>
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <Circle className="h-4 w-4 text-foreground-muted/40" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${isActive ? "font-medium text-foreground" : "text-foreground-muted"}`}>
                  {d.steps[stepId]}
                </p>
              </div>
              <span
                className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${
                  isDone ? "text-success" : isActive ? "text-accent" : "text-foreground-muted/50"
                }`}
              >
                {statusLabel}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AuditRegistryTable({
  packages,
  lang,
  dict,
}: {
  packages: AuditPackageSummary[];
  lang: Locale;
  dict: Dictionary;
}) {
  const d = dict.manager.audit;
  const r = d.registry;

  if (packages.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface-muted px-6 py-10 text-center text-sm text-foreground-muted">
        {d.noHistory}
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted/60 text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-3">{d.colType}</th>
              <th className="px-4 py-3">{d.colPeriod}</th>
              <th className="px-4 py-3">{d.colRecords}</th>
              <th className="px-4 py-3">{d.colGeneratedBy}</th>
              <th className="px-4 py-3">{d.colGeneratedOn}</th>
              <th className="px-4 py-3">{d.colHash}</th>
              <th className="px-4 py-3 text-right">{d.colDownload}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {packages.map((pkg) => (
              <tr key={pkg.id} className="transition-colors hover:bg-surface-muted/40">
                <td className="px-4 py-3">
                  <Badge tone="accent">{d.type[pkg.type]}</Badge>
                </td>
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  {formatDate(pkg.startDate, lang)} → {formatDate(pkg.endDate, lang)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                    <Lock className="h-3 w-3" aria-hidden />
                    {r.protectedRecords.replace("{count}", String(pkg.recordCount))}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground-muted">{pkg.generatedByName}</td>
                <td className="px-4 py-3 text-foreground-muted whitespace-nowrap">
                  {formatDateTime(pkg.createdAt, lang)}
                </td>
                <td className="px-4 py-3">
                  <code className="block max-w-[10rem] truncate font-mono text-[11px] text-foreground-muted" title={pkg.packageHash}>
                    {pkg.packageHash.slice(0, 16)}…
                  </code>
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`/api/audit/package/${pkg.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {d.download}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {packages.map((pkg) => (
          <li key={pkg.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="accent">{d.type[pkg.type]}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                <Lock className="h-3 w-3" aria-hidden />
                {r.protectedRecords.replace("{count}", String(pkg.recordCount))}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium">
              {formatDate(pkg.startDate, lang)} → {formatDate(pkg.endDate, lang)}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              {pkg.generatedByName} · {r.sealedOn.replace("{date}", formatDateTime(pkg.createdAt, lang))}
            </p>
            <div className="mt-3">
              <SecuritySealCertificate hash={pkg.packageHash} dict={dict} compact />
            </div>
            <a
              href={`/api/audit/package/${pkg.id}`}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Download className="h-4 w-4" aria-hidden />
              {d.download}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ManagerAuditDashboard({
  lang,
  dict,
  locationName,
  packages,
}: {
  lang: Locale;
  dict: Dictionary;
  locationName: string;
  packages: AuditPackageSummary[];
}) {
  const router = useRouter();
  const d = dict.manager.audit;

  const defaultEnd = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d14 = new Date(defaultEnd);
    d14.setUTCDate(d14.getUTCDate() - 13);
    return d14;
  }, [defaultEnd]);

  const [type, setType] = useState<AuditType>("FULL");
  const [startDateValue, setStartDateValue] = useState(toDateInputValue(defaultStart));
  const [endDateValue, setEndDateValue] = useState(toDateInputValue(defaultEnd));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    auditPackageLogId: string;
    fileName: string;
    hash: string;
    recordCount: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillComplete, setDrillComplete] = useState(false);
  const [showDrill, setShowDrill] = useState(false);
  const drillTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeDrillSteps = DRILL_STEPS_BY_TYPE[type];

  useEffect(() => {
    if (!isPending) return;

    setShowDrill(true);
    setDrillComplete(false);
    setDrillIndex(0);

    drillTimerRef.current = setInterval(() => {
      setDrillIndex((prev) => {
        const cap = activeDrillSteps.length - 2;
        return prev < cap ? prev + 1 : prev;
      });
    }, DRILL_STEP_MS);

    return () => {
      if (drillTimerRef.current) clearInterval(drillTimerRef.current);
    };
  }, [isPending, activeDrillSteps.length]);

  function generate() {
    setError(null);
    setResult(null);
    setDrillComplete(false);
    startTransition(async () => {
      const response = await generateAuditPackageAction(type, startDateValue, endDateValue);
      if (drillTimerRef.current) clearInterval(drillTimerRef.current);

      if (!response.ok) {
        setShowDrill(false);
        setError(resolveError(dict, response.error));
        return;
      }

      setDrillIndex(activeDrillSteps.length - 1);
      setDrillComplete(true);
      setResult({
        auditPackageLogId: response.auditPackageLogId,
        fileName: response.fileName,
        hash: response.hash,
        recordCount: response.recordCount,
      });
      router.refresh();
    });
  }

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
            <p className="mt-0.5 text-sm text-foreground-muted">
              {locationName} · {d.subtitle}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{d.typeLabel}</h2>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {AUDIT_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                disabled={isPending}
                className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  type === option
                    ? "border-accent bg-accent/10 ring-1 ring-accent/20"
                    : "border-border bg-surface-muted hover:border-accent/30"
                }`}
              >
                <p className="text-sm font-semibold">{d.type[option]}</p>
                <p className="mt-1 text-xs text-foreground-muted">{d.typeHint[option]}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{d.startDateLabel}</span>
              <input
                type="date"
                value={startDateValue}
                disabled={isPending}
                onChange={(e) => setStartDateValue(e.target.value)}
                className="h-10 rounded-xl border border-border bg-surface-muted px-3 text-sm disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{d.endDateLabel}</span>
              <input
                type="date"
                value={endDateValue}
                disabled={isPending}
                onChange={(e) => setEndDateValue(e.target.value)}
                className="h-10 rounded-xl border border-border bg-surface-muted px-3 text-sm disabled:opacity-60"
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {showDrill && (isPending || drillComplete) && (
            <div className="mt-4">
              <InspectionDrillProgress
                steps={activeDrillSteps}
                activeIndex={drillIndex}
                drillComplete={drillComplete}
                dict={dict}
              />
            </div>
          )}

          {result && drillComplete && (
            <div className="mt-4 space-y-4 rounded-xl border border-success/30 bg-success/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-success">{d.generatedTitle}</p>
                    <p className="text-xs text-foreground-muted">
                      {d.generatedRecordCount.replace("{count}", String(result.recordCount))}
                    </p>
                  </div>
                </div>
                <a
                  href={`/api/audit/package/${result.auditPackageLogId}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-success px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {d.downloadNow}
                </a>
              </div>

              <SecuritySealCertificate hash={result.hash} dict={dict} />
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            className="mt-4 w-full sm:w-auto"
            disabled={isPending}
            onClick={generate}
          >
            {isPending ? d.generating : d.generateButton}
          </Button>

          <p className="mt-4 text-xs text-foreground-muted">{d.integrityNote}</p>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{d.historyTitle}</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">{d.registry.subtitle}</p>
          </div>
          <AuditRegistryTable packages={packages} lang={lang} dict={dict} />
        </section>
      </main>
    </div>
  );
}
