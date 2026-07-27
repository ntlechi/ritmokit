"use client";

import { useState, useTransition } from "react";
import { Loader2, Thermometer } from "lucide-react";
import { triggerStaffSicknessAction } from "@/lib/actions/sickness";
import type { RejectionReason } from "@/lib/agents/find-available-replacements";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** Quart confirmé du jour avec employé assigné — éligible au signalement maladie. */
export function canReportSickness(shift: ShiftWithEmployee): boolean {
  if (!shift.employeeId) return false;
  if (shift.status === "CRISIS_ALERT" || shift.status === "REJECTED" || shift.status === "DRAFT") {
    return false;
  }
  if (!["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"].includes(shift.status)) return false;

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(shift.startsAt) === fmt.format(new Date());
}

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.schedule.sickness.errors.unauthorized,
    database_error: dict.schedule.sickness.errors.databaseError,
    shift_not_found: dict.schedule.sickness.errors.shiftNotFound,
    no_employee_assigned: dict.schedule.sickness.errors.noEmployee,
    invalid_shift_status: dict.schedule.sickness.errors.invalidStatus,
    not_today: dict.schedule.sickness.errors.notToday,
  };
  return map[code] ?? dict.schedule.sickness.errors.databaseError;
}

export type SicknessFlowResult = {
  shiftId: string;
  candidates: { userId: string; fullName: string; profilePictureUrl: string | null }[];
  rejections: {
    userId: string;
    fullName: string;
    profilePictureUrl: string | null;
    reason: RejectionReason;
  }[];
  scanned: number;
};

export function ReportSicknessTrigger({
  shift,
  dict,
  lang,
  onSuccess,
  className,
  fullWidth = false,
}: {
  shift: ShiftWithEmployee;
  dict: Dictionary;
  lang: Locale;
  onSuccess: (result: SicknessFlowResult, shift: ShiftWithEmployee) => void;
  className?: string;
  fullWidth?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canReportSickness(shift)) return null;

  function report() {
    setError(null);
    startTransition(async () => {
      const result = await triggerStaffSicknessAction(shift.id, lang);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }

      const crisisShift: ShiftWithEmployee = { ...shift, status: "CRISIS_ALERT" };
      onSuccess(
        {
          shiftId: result.shiftId,
          candidates: result.candidates,
          rejections: result.rejections,
          scanned: result.scanned,
        },
        crisisShift,
      );
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
      <button
        type="button"
        data-interactive
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          report();
        }}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full bg-danger px-3 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60",
          fullWidth && "w-full",
          className,
        )}
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Thermometer className="h-3.5 w-3.5" aria-hidden />
        )}
        {isPending ? dict.schedule.sickness.reporting : dict.schedule.sickness.reportButton}
      </button>
      {error && <p className="text-[10px] text-danger">{error}</p>}
    </div>
  );
}
