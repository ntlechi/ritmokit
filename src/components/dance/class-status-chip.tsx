import type { ClassLiveStatus } from "@/lib/dance/class-display";
import type { StudioOpsCopy } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<ClassLiveStatus, string> = {
  upcoming: "border-border bg-surface text-foreground-muted",
  live: "border-live/30 bg-live/10 text-live",
  done: "border-transparent bg-surface-muted text-foreground-muted",
};

export function ClassStatusChip({
  status,
  copy,
}: {
  status: ClassLiveStatus;
  copy: StudioOpsCopy["classCard"];
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STATUS_CLASS[status],
      )}
    >
      {status === "live" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" aria-hidden />
      )}
      {copy[status]}
    </span>
  );
}
