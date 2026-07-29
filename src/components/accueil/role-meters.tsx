"use client";

import { cn } from "@/lib/utils";

export function RoleMeters({
  leadsFilled,
  leadsMax,
  leadsPresent,
  followsFilled,
  followsMax,
  followsPresent,
  leadsLabel,
  followsLabel,
  presentLabel,
}: {
  leadsFilled: number;
  leadsMax: number;
  leadsPresent: number;
  followsFilled: number;
  followsMax: number;
  followsPresent: number;
  leadsLabel: string;
  followsLabel: string;
  presentLabel: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MeterCard
        tone="lead"
        label={leadsLabel}
        filled={leadsFilled}
        max={leadsMax}
        present={leadsPresent}
        presentLabel={presentLabel}
      />
      <MeterCard
        tone="follow"
        label={followsLabel}
        filled={followsFilled}
        max={followsMax}
        present={followsPresent}
        presentLabel={presentLabel}
      />
    </div>
  );
}

function MeterCard({
  tone,
  label,
  filled,
  max,
  present,
  presentLabel,
}: {
  tone: "lead" | "follow";
  label: string;
  filled: number;
  max: number;
  present: number;
  presentLabel: string;
}) {
  const pct = max > 0 ? Math.min(100, (filled / max) * 100) : 0;
  const presentPct = max > 0 ? Math.min(100, (present / max) * 100) : 0;
  const isLead = tone === "lead";

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4 sm:px-5 sm:py-5",
        isLead
          ? "border-role-lead/35 bg-role-lead/10"
          : "border-role-follow/35 bg-role-follow/10",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={cn(
            "text-xs font-bold uppercase tracking-[0.14em]",
            isLead ? "text-role-lead" : "text-role-follow",
          )}
        >
          {label}
        </p>
        <p className="text-xs font-medium text-foreground-muted">
          <span className="font-semibold tabular-nums text-foreground">{present}</span>{" "}
          {presentLabel}
        </p>
      </div>
      <p className="metric mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
        <span className={isLead ? "text-role-lead" : "text-role-follow"}>{filled}</span>
        <span className="text-2xl font-semibold text-foreground-muted sm:text-3xl">/{max}</span>
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-background/70">
        <div className="relative h-full w-full">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full opacity-35",
              isLead ? "bg-role-lead" : "bg-role-follow",
            )}
            style={{ width: `${pct}%` }}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              isLead ? "bg-role-lead" : "bg-role-follow",
            )}
            style={{ width: `${presentPct}%` }}
            title={`${present} ${presentLabel}`}
          />
        </div>
      </div>
    </div>
  );
}
