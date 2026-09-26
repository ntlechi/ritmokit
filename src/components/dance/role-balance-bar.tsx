import { AlertTriangle } from "lucide-react";
import { balanceState } from "@/lib/dance/class-display";
import type { StudioOpsCopy } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/** Lead vs Follow split, with a warning once the gap blocks one role. */
export function RoleBalanceBar({
  leads,
  follows,
  maxImbalance,
  copy,
  compact = false,
}: {
  leads: number;
  follows: number;
  maxImbalance: number;
  copy: StudioOpsCopy["classCard"];
  compact?: boolean;
}) {
  const state = balanceState(leads, follows, maxImbalance);
  if (state === "none") return null;
  const total = leads + follows;
  const leadPct = total > 0 ? (leads / total) * 100 : 50;
  const warn = state === "needsLeads" || state === "needsFollows";

  return (
    <div className="min-w-0" data-balance={state}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold tabular-nums">
        <span className="text-role-lead">
          {compact ? "L" : copy.leads} {leads}
        </span>
        {warn && !compact && (
          <span className="inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {state === "needsLeads" ? copy.needsLeads : copy.needsFollows}
          </span>
        )}
        <span className="text-role-follow">
          {follows} {compact ? "F" : copy.follows}
        </span>
      </div>
      <div
        className={cn(
          "mt-0.5 flex h-1.5 overflow-hidden rounded-full bg-surface-muted",
          warn && "ring-1 ring-warning/50",
        )}
        role="img"
        aria-label={`${copy.leads} ${leads}, ${copy.follows} ${follows}${
          warn ? `, ${state === "needsLeads" ? copy.needsLeads : copy.needsFollows}` : ""
        }`}
      >
        <div className="h-full bg-role-lead" style={{ width: `${leadPct}%` }} />
        <div className="h-full flex-1 bg-role-follow" />
      </div>
    </div>
  );
}
