"use client";

import type { AccueilClassCard } from "@/lib/data/accueil-roster";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function ClassTimeline({
  classes,
  selectedId,
  onSelect,
  dict,
}: {
  classes: AccueilClassCard[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  dict: Dictionary["accueil"];
}) {
  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory"
      role="listbox"
      aria-label={dict.today}
    >
      {classes.map((cls) => {
        const selected = cls.sessionId === selectedId;
        const statusLabel =
          cls.status === "live" ? dict.live : cls.status === "done" ? dict.done : dict.upcoming;

        return (
          <button
            key={cls.sessionId}
            type="button"
            role="option"
            aria-selected={selected}
            data-interactive
            onClick={() => onSelect(cls.sessionId)}
            className={cn(
              "relative min-w-[9.5rem] shrink-0 snap-start rounded-2xl border px-3 py-3 text-left transition",
              selected
                ? "border-zinc-900 bg-zinc-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-zinc-900"
                : "border-border bg-surface hover:border-foreground/20",
              cls.status === "done" && !selected && "opacity-60",
            )}
          >
            <span
              className="absolute inset-x-3 top-0 h-0.5 rounded-full"
              style={{ backgroundColor: cls.roomColorHex }}
              aria-hidden
            />
            <p className="text-xs font-bold tabular-nums">
              {cls.startLabel}
              <span className={cn("font-medium", selected ? "opacity-70" : "text-foreground-muted")}>
                {" "}
                · {cls.roomName}
              </span>
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{cls.courseTitle}</p>
            <p
              className={cn(
                "mt-2 text-[10px] font-bold uppercase tracking-wide",
                selected
                  ? "opacity-80"
                  : cls.status === "live"
                    ? "text-success"
                    : "text-foreground-muted",
              )}
            >
              {statusLabel}
            </p>
            <p
              className={cn(
                "mt-1 text-[11px] tabular-nums",
                selected ? "opacity-80" : "text-foreground-muted",
              )}
            >
              L {cls.leads.filled}/{cls.leads.max} · F {cls.follows.filled}/{cls.follows.max}
            </p>
          </button>
        );
      })}
    </div>
  );
}
