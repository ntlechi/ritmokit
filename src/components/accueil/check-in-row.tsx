"use client";

import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import type { AccueilRosterRow } from "@/lib/data/accueil-roster";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

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
  const roleLabel =
    row.danceRole === "LEAD"
      ? dict.leads
      : row.danceRole === "FOLLOW"
        ? dict.follows
        : dict.solo;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5",
        waitlisted && "border-border-subtle bg-surface-muted/50",
        !waitlisted && attended && "border-yield/35 bg-yield/8",
        !waitlisted && !attended && "border-border bg-surface",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-base font-bold tracking-tight sm:text-lg">
            {row.studentName}
          </p>
          <RoleChip role={row.danceRole} label={roleLabel} />
          {waitlisted ? (
            <StatusBadge tone="waitlist">{dict.badgeWaitlist}</StatusBadge>
          ) : row.paid ? (
            <StatusBadge tone="paid">{dict.badgePaid}</StatusBadge>
          ) : (
            <StatusBadge tone="pending">{dict.badgePending}</StatusBadge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-foreground-muted sm:text-sm">
          {row.studentEmail}
        </p>
      </div>

      {waitlisted ? (
        <span className="shrink-0 rounded-xl border border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {dict.badgeWaitlist}
        </span>
      ) : (
        <button
          type="button"
          data-interactive
          disabled={busy}
          onClick={() => onToggle(row.enrollmentId, !attended)}
          className={cn(
            "inline-flex min-h-12 min-w-[8.5rem] shrink-0 items-center justify-center gap-1.5 rounded-2xl px-5 text-sm font-bold transition sm:min-h-14 sm:min-w-[9.5rem] sm:text-base",
            attended
              ? "bg-yield text-white hover:brightness-110"
              : "bg-accent text-accent-foreground hover:bg-accent-hover",
            busy && "opacity-70",
          )}
          aria-pressed={attended}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : attended ? (
            <>
              <Check className="h-5 w-5" aria-hidden />
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

function RoleChip({
  role,
  label,
}: {
  role: AccueilRosterRow["danceRole"];
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        role === "LEAD" && "bg-role-lead/15 text-role-lead",
        role === "FOLLOW" && "bg-role-follow/15 text-role-follow",
        role === "SOLO" && "bg-surface-muted text-foreground-muted",
      )}
    >
      {label}
    </span>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "paid" | "pending" | "waitlist";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        tone === "paid" && "bg-yield/15 text-yield",
        tone === "pending" && "bg-warning/15 text-warning",
        tone === "waitlist" && "border border-border bg-surface-muted text-foreground-muted",
      )}
    >
      {children}
    </span>
  );
}
