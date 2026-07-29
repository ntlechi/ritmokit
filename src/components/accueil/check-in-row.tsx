"use client";

import { Check, Loader2 } from "lucide-react";
import type { AccueilRosterRow } from "@/lib/data/accueil-roster";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<AccueilRosterRow["danceRole"], string> = {
  LEAD: "Lead",
  FOLLOW: "Follow",
  SOLO: "Solo",
};

export function CheckInRow({
  row,
  dict,
  busy,
  onToggle,
}: {
  row: AccueilRosterRow;
  dict: Dictionary["accueil"];
  busy: boolean;
  onToggle: (enrollmentId: string, nextAttended: boolean) => void;
}) {
  const waitlisted = row.waitlisted;
  const attended = row.attended;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3",
        waitlisted
          ? "border-border-subtle bg-surface-muted/60 opacity-80"
          : attended
            ? "border-success/30 bg-success/5"
            : "border-border bg-surface",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-semibold tracking-tight">{row.studentName}</p>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              row.danceRole === "LEAD" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
              row.danceRole === "FOLLOW" && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
              row.danceRole === "SOLO" && "bg-surface-muted text-foreground-muted",
            )}
          >
            {ROLE_LABEL[row.danceRole]}
          </span>
          {!row.paid && !waitlisted && (
            <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
              {dict.unpaid}
            </span>
          )}
          {waitlisted && (
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground-muted">
              {dict.waitlisted}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-foreground-muted">{row.studentEmail}</p>
      </div>

      {waitlisted ? (
        <span className="shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-foreground-muted">
          —
        </span>
      ) : (
        <button
          type="button"
          data-interactive
          disabled={busy}
          onClick={() => onToggle(row.enrollmentId, !attended)}
          className={cn(
            "inline-flex min-h-11 min-w-[7.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition",
            attended
              ? "bg-success text-white hover:bg-success/90"
              : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100",
            busy && "opacity-70",
          )}
          aria-pressed={attended}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : attended ? (
            <>
              <Check className="h-4 w-4" aria-hidden />
              {dict.checkedIn}
            </>
          ) : (
            dict.checkIn
          )}
        </button>
      )}
    </li>
  );
}
