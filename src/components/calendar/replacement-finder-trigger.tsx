"use client";

import { Zap } from "lucide-react";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { shiftNeedsReplacement } from "@/components/calendar/replacement-finder-sheet";
import { cn } from "@/lib/utils";

/** Bouton compact mobile-first — ouvre le panneau Remplacement Express. */
export function ReplacementFinderTrigger({
  shift,
  dict,
  onOpen,
  className,
  fullWidth = false,
}: {
  shift: ShiftWithEmployee;
  dict: Dictionary;
  onOpen: (shift: ShiftWithEmployee) => void;
  className?: string;
  fullWidth?: boolean;
}) {
  if (!shiftNeedsReplacement(shift)) return null;

  return (
    <button
      type="button"
      data-interactive
      onClick={(e) => {
        e.stopPropagation();
        onOpen(shift);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full bg-warning/15 px-3 py-2 text-xs font-semibold text-warning ring-1 ring-warning/30 transition-opacity hover:opacity-90",
        fullWidth && "w-full",
        className,
      )}
    >
      <Zap className="h-3.5 w-3.5" aria-hidden />
      {dict.schedule.replacement.findButton}
    </button>
  );
}
