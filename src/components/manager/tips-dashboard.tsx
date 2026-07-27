"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Coins, Radio, Scale, Sparkles, Vote } from "lucide-react";
import { distributeTipsAction } from "@/lib/actions/tips";
import { startTipPoolVoteAction } from "@/lib/actions/tip-votes";
import { getDefaultTipAgreementText } from "@/lib/tips/agreement-template";
import type { ManagerTipsReport } from "@/lib/data/tips";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatSignedDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function formatDistributionDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.manager.tips.errors.unauthorized,
    no_active_tip_agreement: dict.manager.tips.errors.noActiveTipAgreement,
    no_completed_shifts: dict.manager.tips.errors.noCompletedShifts,
    zero_hours_calculated: dict.manager.tips.errors.zeroHoursCalculated,
    already_distributed: dict.manager.tips.errors.alreadyDistributed,
    invalid_amount: dict.manager.tips.errors.invalidAmount,
    invalid_date: dict.manager.tips.errors.invalidDate,
    agreement_too_short: dict.manager.tips.vote.errors.agreementTooShort,
    database_error: dict.manager.tips.errors.databaseError,
  };
  return map[code] ?? dict.manager.tips.errors.databaseError;
}

function voteStatusLabel(dict: Dictionary, status: string) {
  const map: Record<string, string> = {
    DRAFT: dict.manager.tips.vote.statusDraft,
    VOTING: dict.manager.tips.vote.statusVoting,
    APPROVED: dict.manager.tips.vote.statusApproved,
    REJECTED: dict.manager.tips.vote.statusRejected,
  };
  return map[status] ?? status;
}

function voteStatusTone(status: string): "neutral" | "accent" | "success" | "danger" {
  if (status === "VOTING") return "accent";
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

function toDateInputValue(iso: string) {
  const d = new Date(iso);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ManagerTipsDashboard({
  lang,
  dict,
  report,
}: {
  lang: Locale;
  dict: Dictionary;
  report: ManagerTipsReport;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [dateValue, setDateValue] = useState(toDateInputValue(report.todayPreview.date));
  const [agreementText, setAgreementText] = useState(
    report.voteBallot?.agreementText ?? report.poolConfig?.agreementText ?? getDefaultTipAgreementText(lang),
  );
  const [error, setError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isVotePending, startVoteTransition] = useTransition();

  const preview = report.todayPreview;
  const config = report.poolConfig;
  const ballot = report.voteBallot;
  const isToday = dateValue === toDateInputValue(preview.date);

  const canDistribute = useMemo(() => {
    if (!config?.isActive || config.status !== "APPROVED") return false;
    if (isToday && preview.alreadyDistributed) return false;
    if (isToday && preview.completedShiftCount === 0) return false;
    const parsed = Number(amount);
    return parsed > 0;
  }, [config?.isActive, config?.status, isToday, preview, amount]);

  function startVote() {
    setVoteError(null);
    setVoteSuccess(null);
    startVoteTransition(async () => {
      const result = await startTipPoolVoteAction(report.locationId, agreementText);
      if (!result.ok) {
        setVoteError(resolveError(dict, result.error));
        return;
      }
      setVoteSuccess(dict.manager.tips.vote.statusVoting);
      router.refresh();
    });
  }

  function distribute() {
    setError(null);
    setSuccess(null);
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      setError(dict.manager.tips.errors.invalidAmount);
      return;
    }

    startTransition(async () => {
      const result = await distributeTipsAction(dateValue, parsed);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setSuccess(
        dict.manager.tips.successDistributed
          .replace("{count}", String(result.distributedToCount))
          .replace("{amount}", result.totalTipsCollected.toFixed(2)),
      );
      setAmount("");
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
            <h1 className="text-xl font-semibold tracking-tight">{dict.manager.tips.title}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {report.locationName} · {dict.manager.tips.subtitle}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <p className="text-sm leading-relaxed text-foreground-muted">{dict.manager.tips.legalNote}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Vote className="h-4 w-4 text-accent" aria-hidden />
              <h2 className="text-base font-semibold">{dict.manager.tips.vote.title}</h2>
            </div>
            {ballot && (
              <Badge tone={voteStatusTone(ballot.status)}>{voteStatusLabel(dict, ballot.status)}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground-muted">{dict.manager.tips.vote.subtitle}</p>

          {ballot && ballot.totalEmployees > 0 && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-foreground-muted">
                  <span>{dict.manager.tips.vote.participation}</span>
                  <span className="tabular-nums">
                    {ballot.votesCast}/{ballot.totalEmployees}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{
                      width: `${Math.min(100, (ballot.votesCast / ballot.totalEmployees) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-surface-muted px-2 py-2">
                  <dt className="text-xs text-foreground-muted">{dict.manager.tips.vote.yesVotes}</dt>
                  <dd className="metric mt-0.5 text-lg font-semibold text-success">{ballot.yesVotes}</dd>
                </div>
                <div className="rounded-xl bg-surface-muted px-2 py-2">
                  <dt className="text-xs text-foreground-muted">{dict.manager.tips.vote.noVotes}</dt>
                  <dd className="metric mt-0.5 text-lg font-semibold">{ballot.noVotes}</dd>
                </div>
                <div className="rounded-xl bg-surface-muted px-2 py-2">
                  <dt className="text-xs text-foreground-muted">{dict.manager.tips.vote.quorumRequired}</dt>
                  <dd className="metric mt-0.5 text-lg font-semibold">{ballot.requiredToPass}</dd>
                </div>
              </dl>
            </div>
          )}

          {ballot && ballot.votes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              <p className="text-xs font-medium text-foreground-muted">{dict.manager.tips.vote.voteRoster}</p>
              {ballot.votes.map((vote) => (
                <li
                  key={vote.userId}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-muted px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{vote.fullName}</p>
                    <p className="text-xs text-foreground-muted">
                      {dict.manager.tips.vote.signedAs.replace("{name}", vote.signatureName)}
                    </p>
                  </div>
                  <Badge tone={vote.isApproved ? "success" : "danger"}>
                    {vote.isApproved ? dict.manager.tips.vote.voteApproved : dict.manager.tips.vote.voteRejected}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {ballot && ballot.votes.length === 0 && ballot.status === "VOTING" && (
            <p className="mt-4 text-sm text-foreground-muted">{dict.manager.tips.vote.noVotesYet}</p>
          )}

          {ballot?.status !== "VOTING" && (
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground-muted">
                  {dict.manager.tips.vote.agreementLabel}
                </span>
                <textarea
                  value={agreementText}
                  onChange={(e) => setAgreementText(e.target.value)}
                  rows={8}
                  placeholder={dict.manager.tips.vote.agreementPlaceholder}
                  className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm leading-relaxed"
                />
              </label>
              {voteError && (
                <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {voteError}
                </p>
              )}
              {voteSuccess && (
                <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                  {voteSuccess}
                </p>
              )}
              <Button variant="primary" size="md" disabled={isVotePending} onClick={startVote}>
                {isVotePending ? dict.manager.tips.vote.startingVote : dict.manager.tips.vote.startVote}
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">
              {config?.status === "APPROVED" && config.isActive
                ? dict.manager.tips.poolAgreement
                : dict.manager.tips.poolInactive}
            </h2>
          </div>
          {config?.status === "APPROVED" && config.votedAt && (
            <p className="mt-1 text-sm text-foreground-muted">
              {dict.manager.tips.poolSignedOn.replace("{date}", formatSignedDate(config.votedAt, lang))}
            </p>
          )}
          {config?.status === "APPROVED" && config.isActive && report.stations.length > 0 && (
            <dl className="mt-4 grid gap-3 text-center" style={{ gridTemplateColumns: `repeat(${Math.min(report.stations.length, 3)}, minmax(0, 1fr))` }}>
              {report.stations.map((station) => (
                <div key={station.id} className="rounded-xl bg-surface-muted px-3 py-2">
                  <dt className="text-xs text-foreground-muted">
                    {lang === "en" ? station.nameEn : lang === "es" ? station.nameEs : station.nameFr}
                  </dt>
                  <dd className="metric mt-0.5 text-lg font-semibold">{station.tipPoints}×</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{dict.manager.tips.closeDayTitle}</h2>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">{dict.manager.tips.closeDaySubtitle}</p>

          {isToday && preview.posTipsTotal != null && !preview.alreadyDistributed && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 shrink-0 text-success" aria-hidden />
                <p className="text-sm text-foreground-muted">
                  {dict.manager.tips.posAutoFillDetected.replace(
                    "{amount}",
                    preview.posTipsTotal.toFixed(2),
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAmount(preview.posTipsTotal!.toFixed(2))}
              >
                {dict.manager.tips.posAutoFillButton}
              </Button>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{dict.manager.tips.distributionDate}</span>
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="h-10 rounded-xl border border-border bg-surface-muted px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{dict.manager.tips.totalCollected}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 rounded-xl border border-border bg-surface-muted px-3 text-sm tabular-nums"
              />
            </label>
          </div>

          {isToday && (
            <div className="mt-4 rounded-xl bg-surface-muted px-4 py-3 text-sm">
              <p>
                {dict.manager.tips.completedShifts}:{" "}
                <span className="font-semibold tabular-nums">{preview.completedShiftCount}</span>
              </p>
              {preview.alreadyDistributed && preview.distributedTotal != null && (
                <p className="mt-1 text-warning">
                  {dict.manager.tips.alreadyDistributed} — {preview.distributedTotal.toFixed(2)}$
                </p>
              )}
              {!preview.alreadyDistributed && preview.completedShiftCount === 0 && (
                <p className="mt-1 text-foreground-muted">{dict.manager.tips.previewEmpty}</p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {success && (
            <p className="mt-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              {success}
            </p>
          )}

          <Button
            variant="primary"
            size="md"
            className="mt-4 w-full sm:w-auto"
            disabled={!canDistribute || isPending}
            onClick={distribute}
          >
            {isPending ? dict.manager.tips.distributing : dict.manager.tips.distribute}
          </Button>
        </section>

        {report.recentDistributions.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold">{dict.manager.tips.recentTitle}</h2>
            <ul className="flex flex-col gap-2">
              {report.recentDistributions.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium">{formatDistributionDate(d.distributionDate, lang)}</p>
                    <p className="text-xs text-foreground-muted">
                      {dict.manager.tips.shiftCount.replace("{count}", String(d.shiftCount))}
                    </p>
                  </div>
                  <p className="text-lg font-semibold tabular-nums text-success">
                    +{d.totalTipsCollected.toFixed(2)}$
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
