"use client";

import type { DanceClassRow } from "@/lib/data/dance-admin";
import { styleColors } from "@/lib/dance/style-colors";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function formatSessionClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function MiniRoleBar({
  filled,
  max,
  tone,
  label,
}: {
  filled: number;
  max: number;
  tone: "lead" | "follow";
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, (filled / max) * 100) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex justify-between gap-1 text-[10px] font-semibold tabular-nums">
        <span className={tone === "lead" ? "text-role-lead" : "text-role-follow"}>{label}</span>
        <span>
          {filled}/{max}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-background/70">
        <div
          className={cn("h-full rounded-full", tone === "lead" ? "bg-role-lead" : "bg-role-follow")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export type ParityStatus = "balanced" | "needs_leads" | "needs_follows" | "waitlist";

export function parityStatus(cls: DanceClassRow): ParityStatus {
  if (cls.waitlistedCount > 0) return "waitlist";
  const leadGap = cls.maxLeads - cls.leadsFilled;
  const followGap = cls.maxFollows - cls.followsFilled;
  if (cls.imbalance <= 0 && leadGap === 0 && followGap === 0) return "balanced";
  if (cls.imbalance === 0 && leadGap === followGap) return "balanced";
  // More follows booked than leads → need leads
  if (cls.followsFilled - cls.leadsFilled >= 1) return "needs_leads";
  if (cls.leadsFilled - cls.followsFilled >= 1) return "needs_follows";
  if (leadGap > followGap) return "needs_leads";
  if (followGap > leadGap) return "needs_follows";
  return "balanced";
}

function parityChip(dict: Dictionary, cls: DanceClassRow): { label: string; className: string } {
  const d = dict.dance;
  const status = parityStatus(cls);
  const leadDelta = Math.max(0, cls.followsFilled - cls.leadsFilled);
  const followDelta = Math.max(0, cls.leadsFilled - cls.followsFilled);

  if (status === "waitlist") {
    return {
      label: d.parityWaitlist.replace("{count}", String(cls.waitlistedCount)),
      className: "bg-margin-alert/15 text-margin-alert",
    };
  }
  if (status === "needs_leads") {
    return {
      label: d.parityNeedsLeads.replace("{count}", String(Math.max(leadDelta, 1))),
      className: "bg-warning/15 text-warning",
    };
  }
  if (status === "needs_follows") {
    return {
      label: d.parityNeedsFollows.replace("{count}", String(Math.max(followDelta, 1))),
      className: "bg-warning/15 text-warning",
    };
  }
  return {
    label: d.parityBalanced,
    className: "bg-yield/15 text-yield",
  };
}

export function SessionClassCard({
  cls,
  selected,
  onSelect,
  dict,
  compact = false,
  showRoom = true,
  instructorConflict = false,
  assistantConflict = false,
  roomConflict = false,
}: {
  cls: DanceClassRow;
  selected: boolean;
  onSelect: (id: string) => void;
  dict: Dictionary;
  compact?: boolean;
  showRoom?: boolean;
  instructorConflict?: boolean;
  assistantConflict?: boolean;
  roomConflict?: boolean;
}) {
  const colors = styleColors(cls.courseStyle);
  const d = dict.dance;
  const chip = parityChip(dict, cls);
  const levelLabel =
    d.levels[cls.courseLevel as keyof typeof d.levels] ?? cls.courseLevel;
  const conflict = instructorConflict || assistantConflict || roomConflict;

  return (
    <button
      type="button"
      onClick={() => onSelect(cls.id)}
      className={cn(
        "w-full rounded-2xl border px-3 py-2.5 text-left transition",
        selected
          ? "border-accent shadow-glow ring-1 ring-accent/30"
          : conflict
            ? "border-margin-alert/50 hover:border-margin-alert"
            : "border-border hover:border-accent/40",
      )}
      style={{ background: colors.soft }}
    >
      <div
        className="mb-2 h-1 rounded-full"
        style={{ background: conflict ? "var(--margin-alert)" : colors.accent }}
        aria-hidden
      />

      <p className="text-xs font-bold tabular-nums text-foreground">
        {formatSessionClock(cls.startTime)}
        <span className="font-medium text-foreground-muted">
          –{formatSessionClock(cls.endTime)}
        </span>
      </p>

      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
        {cls.courseStyle}
        <span className="font-medium text-foreground-muted"> · {levelLabel}</span>
      </p>
      {!compact && (
        <p className="mt-0.5 line-clamp-1 text-[11px] text-foreground-muted">{cls.courseTitle}</p>
      )}

      {showRoom && (
        <p className="mt-1 truncate text-[11px] font-medium text-foreground-muted">
          {cls.roomName}
          {roomConflict && (
            <span className="ml-1 text-margin-alert">· {d.conflictRoom}</span>
          )}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
          {d.teacherShort}: {cls.instructorName}
        </span>
        {cls.assistantName && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              assistantConflict
                ? "border-margin-alert/50 bg-margin-alert/10 text-margin-alert"
                : "border-border bg-surface/80 text-foreground-muted",
            )}
          >
            {d.assistantShort}: {cls.assistantName}
          </span>
        )}
        {(instructorConflict || assistantConflict) && (
          <span className="rounded-full bg-margin-alert/15 px-2 py-0.5 text-[10px] font-bold text-margin-alert">
            {d.conflictInstructor}
          </span>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <MiniRoleBar
          filled={cls.leadsFilled}
          max={cls.maxLeads}
          tone="lead"
          label={d.lead}
        />
        <MiniRoleBar
          filled={cls.followsFilled}
          max={cls.maxFollows}
          tone="follow"
          label={d.follow}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            chip.className,
          )}
        >
          {chip.label}
        </span>
        {cls.openAgentActions > 0 && (
          <span className="inline-flex rounded-full bg-accent/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
            {d.agentChip.replace("{count}", String(cls.openAgentActions))}
          </span>
        )}
      </div>
    </button>
  );
}
