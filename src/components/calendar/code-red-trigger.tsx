"use client";

import { useState, useTransition } from "react";
import { Siren, Zap } from "lucide-react";
import { triggerCodeRedAction } from "@/lib/actions/code-red";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CODE_RED_WINDOW_MS = 4 * 60 * 60 * 1000;

export function canTriggerCodeRed(shift: ShiftWithEmployee): boolean {
  if (shift.urgency === "CODE_RED") return false;
  const delta = shift.startsAt.getTime() - Date.now();
  if (delta > CODE_RED_WINDOW_MS) return false;
  if (delta < -60 * 60 * 1000) return false;
  return (
    shift.status === "CRISIS_ALERT" ||
    shift.status === "REJECTED" ||
    !shift.employeeId ||
    shift.status === "PUBLISHED" ||
    shift.status === "PENDING_CONFIRMATION" ||
    shift.status === "CONFIRMED"
  );
}

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.schedule.codeRed.errors.unauthorized,
    database_error: dict.schedule.codeRed.errors.databaseError,
    shift_not_found: dict.schedule.codeRed.errors.shiftNotFound,
    already_code_red: dict.schedule.codeRed.errors.alreadyCodeRed,
    not_urgent_enough: dict.schedule.codeRed.errors.notUrgentEnough,
    shift_already_started: dict.schedule.codeRed.errors.shiftAlreadyStarted,
    no_eligible_candidates: dict.schedule.codeRed.errors.noEligibleCandidates,
  };
  return map[code] ?? dict.schedule.codeRed.errors.databaseError;
}

export function CodeRedTrigger({
  shift,
  dict,
  lang,
  fullWidth = false,
  className,
  onSuccess,
}: {
  shift: ShiftWithEmployee;
  dict: Dictionary;
  lang: Locale;
  fullWidth?: boolean;
  className?: string;
  onSuccess?: (candidatesContacted: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [surge, setSurge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (shift.urgency === "CODE_RED") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-danger",
          className,
        )}
      >
        <Siren className="h-3 w-3" aria-hidden />
        {dict.schedule.codeRed.activeBadge}
      </span>
    );
  }

  if (!canTriggerCodeRed(shift)) return null;

  function launch() {
    setError(null);
    setSuccess(null);
    const parsed = surge.trim() === "" ? null : Number(surge.replace(",", "."));
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 50)) {
      setError(dict.schedule.codeRed.errors.databaseError);
      return;
    }

    startTransition(async () => {
      const result = await triggerCodeRedAction({
        shiftId: shift.id,
        surgeBonus: parsed,
        lang,
        allowCrossStation: true,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setSuccess(
        dict.schedule.codeRed.triggeredSuccess.replace(
          "{count}",
          String(result.candidatesContacted),
        ),
      );
      setOpen(false);
      onSuccess?.(result.candidatesContacted);
    });
  }

  return (
    <div className={cn("space-y-2", fullWidth && "w-full", className)}>
      {!open ? (
        <Button
          variant="danger"
          size="sm"
          className={cn("gap-1.5", fullWidth && "w-full")}
          disabled={isPending}
          onClick={() => setOpen(true)}
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          {dict.schedule.codeRed.triggerButton}
        </Button>
      ) : (
        <div className="space-y-2 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-danger">
            {dict.schedule.codeRed.badge}
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              {dict.schedule.codeRed.surgeLabel}
            </span>
            <input
              type="number"
              min={0}
              max={50}
              step={0.25}
              inputMode="decimal"
              placeholder={dict.schedule.codeRed.surgePlaceholder}
              value={surge}
              disabled={isPending}
              onChange={(e) => setSurge(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200/80 bg-white px-3 text-sm outline-none ring-danger/30 focus:border-danger focus:ring-2 dark:border-white/10 dark:bg-zinc-900/60"
            />
            <span className="text-[11px] text-foreground-muted">{dict.schedule.codeRed.surgeHint}</span>
          </label>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={isPending}
              onClick={launch}
            >
              {isPending ? dict.schedule.codeRed.triggering : dict.schedule.codeRed.confirmTrigger}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {dict.common.cancel}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {success && <p className="text-xs text-success">{success}</p>}
    </div>
  );
}
