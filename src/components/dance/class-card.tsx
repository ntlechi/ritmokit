import Link from "next/link";
import { Sparkles, UserRound } from "lucide-react";
import { CapacityPill } from "@/components/dance/capacity-pill";
import { ClassStatusChip } from "@/components/dance/class-status-chip";
import { RoleBalanceBar } from "@/components/dance/role-balance-bar";
import type { ClassLiveStatus } from "@/lib/dance/class-display";
import { styleColors } from "@/lib/dance/style-colors";
import type { StudioOpsCopy } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export type ClassCardData = {
  id: string;
  title: string;
  style: string;
  levelLabel: string;
  startLabel: string;
  endLabel: string;
  roomName: string;
  instructorName: string | null;
  leads: number;
  follows: number;
  /** Seated dancers of every role, SOLO included. */
  booked: number;
  capacity: number;
  waitlisted: number;
  newStudents: number;
  /** `Infinity` for socials (no Lead/Follow warning). */
  maxImbalance: number;
  isSocial?: boolean;
  status?: ClassLiveStatus;
};

/**
 * One class, Fliip-style: color band by style, time, capacity ratio, and the
 * dance-specific bits (Lead/Follow balance, waitlist, first-timers).
 */
export function ClassCard({
  data,
  copy,
  href,
  onSelect,
  selected = false,
  density = "full",
  className,
}: {
  data: ClassCardData;
  copy: StudioOpsCopy["classCard"];
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  density?: "full" | "compact";
  className?: string;
}) {
  const colors = styleColors(data.style);
  const compact = density === "compact";
  const dimmed = data.status === "done";

  const body = (
    <>
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: colors.accent }} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold tabular-nums text-foreground">
          {data.startLabel}
          <span className="font-medium text-foreground-muted">–{data.endLabel}</span>
        </p>
        {compact ? (
          <CapacityPill booked={data.booked} capacity={data.capacity} fullLabel={copy.full} />
        ) : data.status ? (
          <ClassStatusChip status={data.status} copy={copy} />
        ) : null}
      </div>

      <p className={cn("mt-1 font-semibold leading-snug", compact ? "line-clamp-2 text-xs" : "text-sm")}>
        {data.title}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-foreground-muted">
        {data.isSocial ? copy.social : data.levelLabel} · {data.roomName}
      </p>
      {data.instructorName && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-foreground-muted">
          <UserRound className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{data.instructorName}</span>
        </p>
      )}

      {!compact && (
        <div className="mt-2 flex items-center gap-2">
          <CapacityPill
            booked={data.booked}
            capacity={data.capacity}
            label={copy.seats}
            fullLabel={copy.full}
          />
        </div>
      )}

      <div className="mt-2">
        <RoleBalanceBar
          leads={data.leads}
          follows={data.follows}
          maxImbalance={data.isSocial ? Infinity : data.maxImbalance}
          copy={copy}
          compact={compact}
        />
      </div>

      {(data.waitlisted > 0 || data.newStudents > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.newStudents > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
              <Sparkles className="h-3 w-3" aria-hidden />
              {copy.newStudents.replace("{n}", String(data.newStudents))}
            </span>
          )}
          {data.waitlisted > 0 && (
            <span className="inline-flex rounded-full bg-margin-alert/15 px-2 py-0.5 text-[10px] font-bold text-margin-alert">
              {copy.waitlist.replace("{n}", String(data.waitlisted))}
            </span>
          )}
        </div>
      )}
    </>
  );

  const shell = cn(
    "relative block w-full overflow-hidden rounded-2xl border border-border py-2.5 pl-3.5 pr-3 text-left transition",
    (href || onSelect) &&
      "hover:border-accent/50 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
    selected && "border-accent ring-1 ring-accent/40",
    dimmed && "opacity-60",
    className,
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={shell}
        style={{ background: colors.soft }}
        data-interactive
      >
        {body}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} className={shell} style={{ background: colors.soft }} data-interactive>
        {body}
      </Link>
    );
  }
  return (
    <div className={shell} style={{ background: colors.soft }}>
      {body}
    </div>
  );
}
