"use client";

import { useState, useTransition } from "react";
import { Banknote, Copy, ExternalLink, Mail } from "lucide-react";
import {
  cancelInteracAction,
  confirmInteracAction,
  saveInteracSettingsAction,
} from "@/lib/actions/interac";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

export type InteracPendingRow = {
  enrollmentId: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  courseName: string;
  role: string;
  amountCents: number;
  currency: string;
  waitingHours: number;
  interacReferenceHint: string | null;
  sessionLabel: string | null;
};

export type InteracDashboard = {
  pending: InteracPendingRow[];
  summary: { count: number; totalAmountCents: number };
  stats: {
    pending: number;
    confirmedToday: number;
    confirmedWeek: number;
    cancelledWeek: number;
    avgConfirmHours: number | null;
    pendingTotalCents: number;
  };
  settings: {
    depositEmail: string | null;
    securityQuestion: string | null;
    passwordHint: string | null;
    inboxUrl: string | null;
    notifyStaffEmail: string | null;
    alertOnPending: boolean;
  };
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(cents / 100);
}

function waitingLabel(hours: number, t: Dictionary["interac"]) {
  if (hours < 1) return t.waitingUnderHour;
  if (hours < 24) return t.waitingHours.replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  return days === 1 ? t.waitingDay : t.waitingDays.replace("{n}", String(days));
}

function roleLabel(role: string, t: Dictionary["interac"]) {
  if (role === "lead") return t.roleLead;
  if (role === "follow") return t.roleFollow;
  return t.roleSolo;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function InteracQueuePanel({
  dict,
  initial,
}: {
  lang: Locale;
  dict: Dictionary;
  initial: InteracDashboard;
}) {
  const t = dict.interac;
  const [pending, setPending] = useState(initial.pending);
  const [summary, setSummary] = useState(initial.summary);
  const [settings, setSettings] = useState(initial.settings);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resolveError(code: string) {
    const map: Record<string, string> = {
      unauthorized: t.errors.unauthorized,
      database_error: t.errors.databaseError,
      not_pending_interac: t.errors.notPending,
      already_paid: t.errors.alreadyPaid,
      enrollment_not_found: t.errors.notFound,
      invalid_payload: t.errors.invalidPayload,
    };
    return map[code] ?? t.errors.databaseError;
  }

  function removeFromQueue(id: string) {
    setPending((prev) => {
      const next = prev.filter((p) => p.enrollmentId !== id);
      const totalAmountCents = next.reduce((s, i) => s + i.amountCents, 0);
      setSummary({ count: next.length, totalAmountCents });
      return next;
    });
  }

  function handleConfirm(id: string, sendEmail: boolean) {
    setError(null);
    setActiveId(id);
    startTransition(async () => {
      const result = await confirmInteracAction(id, { sendConfirmationEmail: sendEmail });
      setActiveId(null);
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      removeFromQueue(id);
    });
  }

  function handleCancel(id: string) {
    if (!window.confirm(t.cancelConfirm)) return;
    setError(null);
    setActiveId(id);
    startTransition(async () => {
      const result = await cancelInteracAction(id, "transfer_not_received");
      setActiveId(null);
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      removeFromQueue(id);
    });
  }

  function handleCopy(key: string, value: string) {
    startTransition(async () => {
      const ok = await copyText(value);
      if (ok) {
        setCopied(key);
        window.setTimeout(() => setCopied(null), 1500);
      }
    });
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveInteracSettingsAction(settings);
      if (!result.ok) setError(resolveError(result.error));
    });
  }

  const inboxHref =
    settings.inboxUrl?.trim() ||
    (settings.depositEmail ? `mailto:${settings.depositEmail}` : null);

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6">
      <section className={cn(dna.panel, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/15 text-warning">
            <Banknote className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {t.badgeCount
                .replace("{n}", String(summary.count))
                .replace("{total}", money(summary.totalAmountCents, "CAD"))}
            </p>
            <p className="text-xs text-foreground-muted">{t.ownerHint}</p>
          </div>
        </div>
        {inboxHref && (
          <a
            href={inboxHref}
            target="_blank"
            rel="noreferrer"
            className={cn(dna.ctaGhost, "text-sm")}
          >
            <Mail className="h-4 w-4" aria-hidden />
            {t.openInbox}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="space-y-3">
        {pending.length === 0 ? (
          <p className={cn(dna.panel, "px-6 py-10 text-center text-sm text-foreground-muted")}>
            {t.empty}
          </p>
        ) : (
          pending.map((row) => {
            const busy = isPending && activeId === row.enrollmentId;
            const amount = money(row.amountCents, row.currency);
            return (
              <article
                key={row.enrollmentId}
                className="rounded-2xl border border-warning/30 bg-surface p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {row.studentName}
                      <span className="ml-2 text-xs font-medium text-foreground-muted">
                        {roleLabel(row.role, t)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-foreground-muted">
                      {row.courseName}
                      {row.sessionLabel ? ` · ${row.sessionLabel}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {waitingLabel(row.waitingHours, t)}
                      {row.interacReferenceHint ? ` · ${row.interacReferenceHint}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold tracking-tight">{amount}</p>
                    <Badge tone="warning">{t.statusPending}</Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(`amt-${row.enrollmentId}`, amount)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {copied === `amt-${row.enrollmentId}` ? t.copied : t.copyAmount}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCopy(`em-${row.enrollmentId}`, row.studentEmail)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {copied === `em-${row.enrollmentId}` ? t.copied : t.copyEmail}
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => handleConfirm(row.enrollmentId, false)}
                  >
                    {t.confirm}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => handleConfirm(row.enrollmentId, true)}
                  >
                    {t.confirmEmail}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => handleCancel(row.enrollmentId)}
                  >
                    {t.cancel}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.settingsTitle}</h2>
          <p className="text-sm text-foreground-muted">{t.settingsHint}</p>
        </div>
        <form onSubmit={handleSaveSettings} className={cn(dna.panel, "grid gap-3 p-4 sm:grid-cols-2")}>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>{t.depositEmail}</span>
            <input
              type="email"
              className={dna.field}
              value={settings.depositEmail ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, depositEmail: e.target.value || null }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t.securityQuestion}</span>
            <input
              className={dna.field}
              value={settings.securityQuestion ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, securityQuestion: e.target.value || null }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t.passwordHint}</span>
            <input
              className={dna.field}
              value={settings.passwordHint ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, passwordHint: e.target.value || null }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t.inboxUrl}</span>
            <input
              className={dna.field}
              value={settings.inboxUrl ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, inboxUrl: e.target.value || null }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t.notifyStaffEmail}</span>
            <input
              type="email"
              className={dna.field}
              value={settings.notifyStaffEmail ?? ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, notifyStaffEmail: e.target.value || null }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={settings.alertOnPending}
              onChange={(e) =>
                setSettings((s) => ({ ...s, alertOnPending: e.target.checked }))
              }
            />
            {t.alertOnPending}
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {t.saveSettings}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
