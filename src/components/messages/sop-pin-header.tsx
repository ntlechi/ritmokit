"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { SopPinSummary } from "@/lib/data/chat";
import { cn } from "@/lib/utils";

export function SopPinHeader({
  dict,
  sopPin,
}: {
  dict: Dictionary;
  sopPin: SopPinSummary | null;
}) {
  const [open, setOpen] = useState(true);

  if (!sopPin) {
    return (
      <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-muted">
        {dict.messages.noSopPinned}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        data-interactive
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="truncate text-sm font-medium">
            {dict.messages.sopPinned}: {sopPin.title}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-foreground-muted" /> : <ChevronDown className="h-4 w-4 text-foreground-muted" />}
      </button>
      <div className={cn("px-3 pb-3 text-sm text-foreground-muted", !open && "hidden")}>{sopPin.body}</div>
    </div>
  );
}
