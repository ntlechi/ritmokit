"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Loader2,
  UserCheck,
  UserX,
  X,
  Zap,
} from "lucide-react";
import {
  assignReplacementAction,
  notifyReplacementCandidateAction,
  scanReplacementsAction,
} from "@/lib/actions/replacement";
import type { RejectionReason } from "@/lib/agents/find-available-replacements";
import { formatTimeRange } from "@/lib/calendar/format";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel as stationDisplayLabel } from "@/lib/stations/display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export type ReplacementScanState = {
  candidates: { userId: string; fullName: string; profilePictureUrl: string | null }[];
  rejections: {
    userId: string;
    fullName: string;
    profilePictureUrl: string | null;
    reason: RejectionReason;
  }[];
  scanned: number;
};

export function shiftNeedsReplacement(shift: ShiftWithEmployee): boolean {
  if (shift.status === "CRISIS_ALERT" || shift.status === "REJECTED") return true;
  if (!shift.employeeId) return true;
  return false;
}

function rejectionLabel(dict: Dictionary, reason: RejectionReason): string {
  return dict.schedule.replacement.rejections[reason];
}

function resolveActionError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.schedule.replacement.errors.unauthorized,
    database_error: dict.schedule.replacement.errors.databaseError,
    shift_not_found: dict.schedule.replacement.errors.shiftNotFound,
    candidate_not_found: dict.schedule.replacement.errors.candidateNotFound,
    candidate_not_eligible: dict.schedule.replacement.errors.candidateNotEligible,
    training_incomplete: dict.schedule.replacement.errors.trainingIncomplete,
    channel_not_found: dict.schedule.replacement.errors.channelNotFound,
  };
  if (code.startsWith("CNESST:")) return code;
  return map[code] ?? dict.schedule.replacement.errors.databaseError;
}

export function ReplacementFinderSheet({
  shift,
  open,
  onClose,
  lang,
  dict,
  onAssigned,
  initialScan,
}: {
  shift: ShiftWithEmployee | null;
  open: boolean;
  onClose: () => void;
  lang: Locale;
  dict: Dictionary;
  onAssigned?: () => void;
  /** Scan pré-chargé (ex. après signalement maladie) — évite une seconde requête. */
  initialScan?: ReplacementScanState | null;
}) {
  const r = dict.schedule.replacement;
  const [scan, setScan] = useState<ReplacementScanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isScanning, startScan] = useTransition();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"assign" | "notify" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showRejections, setShowRejections] = useState(false);

  useEffect(() => {
    if (!open || !shift) {
      setScan(null);
      setError(null);
      setActionError(null);
      setSuccessMessage(null);
      setShowRejections(false);
      return;
    }

    setError(null);
    if (initialScan) {
      setScan(initialScan);
      return;
    }
    setScan(null);
    startScan(async () => {
      const result = await scanReplacementsAction(shift.id);
      if (!result.ok) {
        setError(resolveActionError(dict, result.error));
        return;
      }
      setScan({
        candidates: result.candidates,
        rejections: result.rejections,
        scanned: result.scanned,
      });
    });
  }, [open, shift?.id, initialScan]);

  function runAction(userId: string, action: "assign" | "notify") {
    if (!shift) return;
    setActionError(null);
    setSuccessMessage(null);
    setPendingUserId(userId);
    setPendingAction(action);

    startScan(async () => {
      const result =
        action === "assign"
          ? await assignReplacementAction(shift.id, userId)
          : await notifyReplacementCandidateAction(shift.id, userId, lang);

      setPendingUserId(null);
      setPendingAction(null);

      if (!result.ok) {
        setActionError(resolveActionError(dict, result.error));
        return;
      }

      setSuccessMessage(action === "assign" ? r.assignedSuccess : r.notifiedSuccess);
      onAssigned?.();
    });
  }

  if (!shift) return null;

  const stationLabelText = stationDisplayLabel(shift.station, lang);
  const timeLabel = formatTimeRange(shift.startsAt, shift.endsAt, lang);
  const dateLabel = new Intl.DateTimeFormat(lang, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "America/Toronto",
  }).format(shift.startsAt);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border border-zinc-200/80 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200/80 px-4 py-4 dark:border-white/10">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                <Dialog.Title className="text-base font-semibold">{r.title}</Dialog.Title>
              </div>
              <Dialog.Description className="mt-1 text-sm text-foreground-muted">
                {stationLabelText} · {dateLabel} · {timeLabel}
              </Dialog.Description>
              {shift.employee?.fullName && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {r.replacingLabel}: <span className="font-medium text-foreground">{shift.employee.fullName}</span>
                </p>
              )}
            </div>
            <Dialog.Close
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-zinc-100 dark:hover:bg-white/5"
              aria-label={dict.common.cancel}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isScanning && !scan && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden />
                <p className="text-sm font-medium">{r.scanning}</p>
                <p className="text-xs text-foreground-muted">{r.scanningHint}</p>
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
            )}

            {successMessage && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                {successMessage}
              </div>
            )}

            {actionError && (
              <p className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {actionError}
              </p>
            )}

            {scan && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{r.candidatesTitle}</h3>
                  <span className="text-xs text-foreground-muted">
                    {r.scannedCount.replace("{count}", String(scan.scanned))}
                  </span>
                </div>

                {scan.candidates.length === 0 ? (
                  <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-6 text-center">
                    <AlertTriangle className="mx-auto h-6 w-6 text-warning" aria-hidden />
                    <p className="mt-2 text-sm font-medium">{r.noCandidates}</p>
                    <p className="mt-1 text-xs text-foreground-muted">{r.noCandidatesHint}</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {scan.candidates.map((candidate) => {
                      const isBusy =
                        pendingUserId === candidate.userId &&
                        (isScanning || pendingAction != null);
                      return (
                        <li
                          key={candidate.userId}
                          className="rounded-xl border border-success/25 bg-success/5 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <UserAvatar
                                fullName={candidate.fullName}
                                pictureUrl={candidate.profilePictureUrl}
                                size="sm"
                              />
                              <p className="truncate text-sm font-semibold">{candidate.fullName}</p>
                            </div>
                            <Badge tone="success">{r.eligibleBadge}</Badge>
                          </div>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <Button
                              variant="primary"
                              size="sm"
                              className="flex-1"
                              disabled={isBusy}
                              onClick={() => runAction(candidate.userId, "assign")}
                            >
                              {isBusy && pendingAction === "assign" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {r.assignButton}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1"
                              disabled={isBusy}
                              onClick={() => runAction(candidate.userId, "notify")}
                            >
                              {isBusy && pendingAction === "notify" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Bell className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {r.notifyButton}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {scan.rejections.length > 0 && (
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
                    <button
                      type="button"
                      onClick={() => setShowRejections((v) => !v)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <UserX className="h-4 w-4 text-foreground-muted" aria-hidden />
                        <span className="text-sm font-medium">{r.rejectionsTitle}</span>
                        <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-xs tabular-nums text-foreground-muted dark:bg-white/10">
                          {scan.rejections.length}
                        </span>
                      </div>
                      <span className="text-xs text-accent">{showRejections ? r.hideRejections : r.showRejections}</span>
                    </button>
                    {showRejections && (
                      <ul className="space-y-1.5 border-t border-zinc-200/80 px-4 py-3 dark:border-white/10">
                        {scan.rejections.map((row) => (
                          <li
                            key={`${row.userId}-${row.reason}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <UserAvatar
                                fullName={row.fullName}
                                pictureUrl={row.profilePictureUrl}
                                size="sm"
                              />
                              <span className="truncate font-medium">{row.fullName}</span>
                            </span>
                            <span className="rounded-full bg-danger/10 px-2 py-0.5 font-medium text-danger">
                              {rejectionLabel(dict, row.reason)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="safe-area-pb border-t border-zinc-200/80 px-4 py-3 dark:border-white/10">
            <Button variant="secondary" size="md" className="w-full" onClick={onClose}>
              {dict.common.cancel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
