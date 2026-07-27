"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Radio,
  RefreshCw,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { rotatePosWebhookSecretAction } from "@/lib/actions/pos-manager";
import type { ManagerPosReport } from "@/lib/data/pos-manager";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.manager.pos.errors.unauthorized,
    integration_not_found: dict.manager.pos.errors.integrationNotFound,
    database_error: dict.manager.pos.errors.databaseError,
  };
  return map[code] ?? dict.manager.pos.errors.databaseError;
}

function formatRelativeSync(iso: string, locale: Locale, dict: Dictionary) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return dict.manager.pos.lastSyncJustNow;
  if (minutes < 60) return dict.manager.pos.lastSyncMinutes.replace("{minutes}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return dict.manager.pos.lastSyncHours.replace("{hours}", String(hours));
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function formatCurrency(amount: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "CAD" }).format(amount);
}

function ClusterBrandMark() {
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-sm font-bold tracking-tight text-white shadow-xs dark:bg-white dark:text-zinc-900"
      aria-hidden
    >
      C
    </div>
  );
}

function CopyField({
  label,
  value,
  copiedLabel,
  copyLabel,
}: {
  label: string;
  value: string;
  copiedLabel: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-muted">{label}</span>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-muted px-3 py-2.5 font-mono text-xs outline-none"
        />
        <Button type="button" variant="secondary" size="sm" onClick={copy} className="shrink-0">
          {copied ? (
            <>
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
              {copiedLabel}
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
              {copyLabel}
            </>
          )}
        </Button>
      </div>
    </label>
  );
}

export function PosManagerDashboard({
  lang,
  dict,
  report,
}: {
  lang: Locale;
  dict: Dictionary;
  report: ManagerPosReport;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [isPending, startTransition] = useTransition();

  const integration = report.integration;
  const providerLabel = useMemo(() => {
    if (!integration) return "";
    const map: Record<string, string> = {
      CLUSTER: "Cluster POS",
      SQUARE: "Square",
      CLOVER: "Clover",
    };
    return map[integration.provider] ?? integration.provider;
  }, [integration]);

  function rotateSecret() {
    setError(null);
    startTransition(async () => {
      const result = await rotatePosWebhookSecretAction(report.locationId);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        setConfirmRotate(false);
        return;
      }
      setRotatedSecret(result.secret);
      setConfirmRotate(false);
      router.refresh();
    });
  }

  if (!integration) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="border-b border-border px-4 py-4 sm:px-6">
          <Link
            href={`/${lang}/settings/manager`}
            className="mb-3 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {dict.settings.manager}
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{dict.manager.pos.title}</h1>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <p className="rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center text-sm text-foreground-muted">
            {dict.manager.pos.noIntegration}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <Link
          href={`/${lang}/settings/manager`}
          className="mb-3 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {dict.settings.manager}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{dict.manager.pos.title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {report.locationName} · {dict.manager.pos.subtitle}
        </p>
      </header>

      <main className="flex-1 space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          {/* Carte maîtresse — fournisseur & statut live */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <ClusterBrandMark />
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{providerLabel}</h2>
                  <p className="mt-0.5 text-sm text-foreground-muted">
                    {dict.manager.pos.activeIntegration}
                    {integration.externalId ? ` · ${integration.externalId}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {report.isLive ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                    <Wifi className="h-3.5 w-3.5" aria-hidden />
                    {dict.manager.pos.statusLive}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground-muted">
                    <WifiOff className="h-3.5 w-3.5" aria-hidden />
                    {dict.manager.pos.statusIdle}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-muted px-4 py-3 text-sm">
              <Radio className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              {report.lastSyncAt ? (
                <span className="text-foreground-muted">
                  {dict.manager.pos.lastInvoiceProcessed.replace(
                    "{when}",
                    formatRelativeSync(report.lastSyncAt, lang, dict),
                  )}
                </span>
              ) : (
                <span className="text-foreground-muted">{dict.manager.pos.noSyncYet}</span>
              )}
            </div>
          </section>

          {/* Carte sécurité — secret & URL webhook */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" aria-hidden />
              <h2 className="text-base font-semibold">{dict.manager.pos.securityTitle}</h2>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.pos.securitySubtitle}</p>

            <div className="mt-4 space-y-4">
              <CopyField
                label={dict.manager.pos.webhookUrl}
                value={report.webhookUrl}
                copyLabel={dict.manager.pos.copyUrl}
                copiedLabel={dict.manager.pos.copied}
              />

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground-muted">{dict.manager.pos.webhookSecret}</span>
                <input
                  readOnly
                  type="password"
                  value={
                    rotatedSecret
                      ? `${"•".repeat(28)}${rotatedSecret.slice(-4)}`
                      : integration.maskedSecret
                  }
                  className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 font-mono text-sm tracking-widest outline-none"
                />
              </label>

              {rotatedSecret && (
                <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
                  <p className="font-medium">{dict.manager.pos.secretRotatedTitle}</p>
                  <p className="mt-1 text-xs text-foreground-muted">{dict.manager.pos.secretRotatedHint}</p>
                  <CopyField
                    label={dict.manager.pos.newSecretLabel}
                    value={rotatedSecret}
                    copyLabel={dict.manager.pos.copySecret}
                    copiedLabel={dict.manager.pos.copied}
                  />
                </div>
              )}

              <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <p className="text-foreground-muted">{dict.manager.pos.rotateWarning}</p>
                </div>
              </div>

              {confirmRotate ? (
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="danger" disabled={isPending} onClick={rotateSecret}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isPending && "animate-spin")} aria-hidden />
                    {isPending ? dict.manager.pos.rotating : dict.manager.pos.confirmRotate}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => setConfirmRotate(false)}
                  >
                    {dict.common.cancel}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setConfirmRotate(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                  {dict.manager.pos.rotateSecret}
                </Button>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          </section>
        </div>

        {/* Journal des flux */}
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-base font-semibold">{dict.manager.pos.ingestionTitle}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{dict.manager.pos.ingestionSubtitle}</p>

          {report.recentIngestions.length === 0 ? (
            <p className="mt-4 rounded-xl bg-surface-muted px-4 py-6 text-center text-sm text-foreground-muted">
              {dict.manager.pos.ingestionEmpty}
            </p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/60 text-xs uppercase tracking-wide text-foreground-muted">
                    <th className="px-4 py-3 font-medium">{dict.manager.pos.colOrder}</th>
                    <th className="px-4 py-3 font-medium">{dict.manager.pos.colNet}</th>
                    <th className="px-4 py-3 font-medium">{dict.manager.pos.colTips}</th>
                    <th className="px-4 py-3 font-medium">{dict.manager.pos.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recentIngestions.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{row.posOrderId}</td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(row.netSales, lang)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(row.tipsCollected, lang)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={row.status === "PROCESSED" ? "success" : "neutral"}>
                          {row.status === "PROCESSED"
                            ? dict.manager.pos.statusProcessed
                            : dict.manager.pos.statusDuplicate}
                        </Badge>
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
