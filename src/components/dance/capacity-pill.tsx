import { capacityTone, type CapacityTone } from "@/lib/dance/class-display";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<CapacityTone, string> = {
  open: "border-border bg-surface text-foreground",
  almost: "border-warning/40 bg-warning/15 text-warning",
  full: "border-danger/40 bg-danger/15 text-danger",
};

export function CapacityPill({
  booked,
  capacity,
  label,
  fullLabel,
  className,
}: {
  booked: number;
  capacity: number;
  /** Unit after the ratio, e.g. "places". */
  label?: string;
  /** Shown instead of the unit once the class is full. */
  fullLabel?: string;
  className?: string;
}) {
  const tone = capacityTone(booked, capacity);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums",
        TONE_CLASS[tone],
        className,
      )}
      data-tone={tone}
    >
      {booked}/{capacity}
      {tone === "full" && fullLabel ? (
        <span className="font-semibold uppercase tracking-wide">{fullLabel}</span>
      ) : label ? (
        <span className="font-medium opacity-75">{label}</span>
      ) : null}
    </span>
  );
}
