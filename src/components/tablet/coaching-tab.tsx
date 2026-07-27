"use client";

import type { getDemoTabletSnapshot } from "@/lib/demo/franchise-pitch";

type Snapshot = ReturnType<typeof getDemoTabletSnapshot>;

export function CoachingTab({ snapshot }: { snapshot: Snapshot }) {
  const { coaching, brand } = snapshot;

  if (coaching.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white p-6 text-center text-sm text-foreground-muted dark:bg-surface">
        Aucune action coaching pour ce jour.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">
        Actions coaching requises
      </p>
      {coaching.map((item) => (
        <article
          key={`${item.employeeId}-${item.level}`}
          className="rounded-xl border border-border bg-white p-4 dark:bg-surface"
          style={item.priority === "normal" ? { opacity: 0.65 } : undefined}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black text-white"
                style={{ background: item.priority === "high" ? "#BA7517" : brand.primaryColor }}
              >
                {item.employee.initials}
              </span>
              <p className="text-sm font-black text-foreground">{item.employee.fullName}</p>
            </div>
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold"
              style={
                item.priority === "high"
                  ? { background: "#FCEBEB", color: "#791F1F" }
                  : { background: "#F1EFE8", color: "#444441" }
              }
            >
              Niveau {item.level}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-foreground-muted">{item.body}</p>
          <p className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-xs italic text-foreground">
            {item.script}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-950 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white"
            >
              {item.primaryCta}
            </button>
            <button
              type="button"
              className="rounded-md bg-zinc-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {item.secondaryCta}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
