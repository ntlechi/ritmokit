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
      className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 snap-x snap-mandatory"
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
              "relative min-h-[6.5rem] min-w-[10.5rem] shrink-0 snap-start rounded-2xl border px-3.5 py-3.5 text-left transition",
              selected
                ? "border-accent bg-accent text-accent-foreground shadow-glow"
                : "border-border bg-surface hover:border-accent/40",
              cls.status === "done" && !selected && "opacity-55",
              cls.status === "live" && !selected && "border-live/40 shadow-glow",
            )}
          >
            <span
              className="absolute inset-x-3 top-0 h-0.5 rounded-full"
              style={{ backgroundColor: selected ? "currentColor" : cls.roomColorHex }}
              aria-hidden
            />
            <p className="text-sm font-bold tabular-nums">
              {cls.startLabel}
              <span className={cn("font-medium", selected ? "opacity-80" : "text-foreground-muted")}>
                {" "}
                · {cls.roomName}
              </span>
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">
              {cls.courseTitle}
              {cls.isSocial ? (
                <span
                  className={cn(
                    "ml-1.5 align-middle text-[10px] font-bold uppercase tracking-wide",
                    selected ? "opacity-90" : "text-accent",
                  )}
                >
                  {dict.eventBadge}
                </span>
              ) : null}
            </p>
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide",
                selected
                  ? "opacity-90"
                  : cls.status === "live"
                    ? "text-live"
                    : "text-foreground-muted",
              )}
            >
              {cls.status === "live" && !selected && (
                <span className="live-pulse" aria-hidden />
              )}
              {statusLabel}
            </p>
            <p
              className={cn(
                "mt-1.5 text-xs font-semibold tabular-nums",
                selected ? "opacity-90" : "text-foreground-muted",
              )}
            >
              {cls.isSocial ? (
                <span>
                  {cls.presentCount} {dict.present}
                </span>
              ) : (
                <>
                  <span className={selected ? undefined : "text-role-lead"}>
                    L {cls.leads.filled}/{cls.leads.max}
                  </span>
                  {" · "}
                  <span className={selected ? undefined : "text-role-follow"}>
                    F {cls.follows.filled}/{cls.follows.max}
                  </span>
                </>
              )}
            </p>
          </button>
        );
      })}
    </div>
  );
}
