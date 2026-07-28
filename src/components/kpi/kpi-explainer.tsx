"use client";

import { useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { DanceKpiKey } from "@/lib/kpi/types";
import { cn } from "@/lib/utils";

type ExplainerCopy = {
  title: string;
  formula: string;
  why: string;
  target: string;
  source: string;
};

export function KpiExplainer({
  kpiKey,
  dict,
  className,
}: {
  kpiKey: DanceKpiKey;
  dict: Dictionary;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const copy = dict.kpi.explainers[kpiKey] as ExplainerCopy;

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={copy.title}
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div
          id={panelId}
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-3 text-left shadow-lg"
        >
          <p className="text-xs font-semibold text-foreground">{copy.title}</p>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
            {dict.kpi.formulaLabel}
          </p>
          <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-foreground">{copy.formula}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-foreground-muted">{copy.why}</p>
          <p className="mt-2 text-[11px]">
            <span className="font-semibold text-foreground">{dict.kpi.targetLabel}: </span>
            <span className="text-foreground-muted">{copy.target}</span>
          </p>
          <p className="mt-1 text-[10px] text-foreground-muted">
            <span className="font-semibold">{dict.kpi.sourceLabel}: </span>
            {copy.source}
          </p>
        </div>
      )}
    </span>
  );
}
