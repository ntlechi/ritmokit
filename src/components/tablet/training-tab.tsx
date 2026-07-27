"use client";

import type { getDemoTabletSnapshot } from "@/lib/demo/franchise-pitch";
import { cn } from "@/lib/utils";

type Snapshot = ReturnType<typeof getDemoTabletSnapshot>;

export function TrainingTab({ snapshot }: { snapshot: Snapshot }) {
  const { formations, brand, day } = snapshot;

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">
        Progression équipe — semaine 1 · J{day}
      </p>
      {formations.map(({ employee, modules }) => (
        <article key={employee.id} className="rounded-xl border border-border bg-white p-3 dark:bg-surface">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black text-white"
                style={{ background: employee.trainingPercent >= 100 ? "#1D9E75" : "#0E0E0E" }}
              >
                {employee.initials}
              </span>
              <div>
                <p className="text-xs font-black text-foreground">{employee.fullName}</p>
                <p className="text-[10px] text-foreground-muted">
                  {employee.trainingPercent >= 100
                    ? "Formation complétée"
                    : employee.status === "onboarding_j1"
                      ? "Jour 1 · onboarding"
                      : `${employee.trainingPercent}%`}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-bold",
                employee.trainingPercent >= 100
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-amber-50 text-amber-900",
              )}
            >
              {employee.trainingPercent}%
            </span>
          </div>
          <ul>
            {modules.map((m) => (
              <li key={m.id} className="flex items-center gap-2 border-b border-zinc-100 py-2 last:border-0 dark:border-zinc-800">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black",
                    m.status === "done" && "text-white",
                    m.status === "active" && "bg-zinc-950 text-white",
                    m.status === "locked" && "bg-zinc-100 text-zinc-400 dark:bg-zinc-800",
                  )}
                  style={m.status === "done" ? { background: brand.primaryColor } : undefined}
                >
                  {m.status === "done" ? "✓" : m.unlockDay}
                </span>
                <span className="flex-1 text-xs font-semibold text-foreground">{m.title}</span>
                <span
                  className={cn(
                    "text-[10px] font-bold",
                    m.status === "done" && "text-success",
                    m.status === "active" && "text-[var(--brand)]",
                    m.status === "locked" && "text-zinc-400",
                  )}
                >
                  {m.status === "done"
                    ? "Complété"
                    : m.status === "active"
                      ? "En cours"
                      : `Déverrouille J${m.unlockDay}`}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
