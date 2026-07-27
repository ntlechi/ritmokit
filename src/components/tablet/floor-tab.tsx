"use client";

import type { getDemoTabletSnapshot } from "@/lib/demo/franchise-pitch";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Snapshot = ReturnType<typeof getDemoTabletSnapshot>;

function statusBadge(status: string) {
  if (status === "late") return { label: "Retard", className: "bg-red-50 text-red-800" };
  if (status === "onboarding_j1") return { label: "J1 onboarding", className: "bg-amber-50 text-amber-900" };
  if (status === "on_floor") return { label: "En poste", className: "bg-emerald-50 text-emerald-900" };
  return { label: "Off", className: "bg-zinc-100 text-zinc-600" };
}

export function FloorTab({ snapshot }: { snapshot: Snapshot }) {
  const { stats, floorEmployees, coachingBanner, brand } = snapshot;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Sur le plancher", value: stats.onFloor },
          { label: "Formations J1", value: stats.formationsJ1, hot: stats.formationsJ1 > 0 },
          { label: "Modules complétés", value: stats.modulesCompleted, good: true },
          { label: "Alertes actives", value: stats.activeAlerts, hot: stats.activeAlerts > 0 },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-xs dark:border-white/10 dark:bg-zinc-900/60"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
              {s.label}
            </p>
            <p
              className={cn(
                "metric mt-1 text-2xl font-bold",
                s.hot && "text-danger",
                s.good && "text-success",
                !s.hot && !s.good && "text-foreground",
              )}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {coachingBanner && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="text-xs font-semibold leading-snug">{coachingBanner}</span>
        </div>
      )}

      <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">
        Équipe en poste
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {floorEmployees.map((emp) => {
          const badge = statusBadge(emp.status);
          return (
            <article
              key={emp.id}
              className={cn(
                "rounded-xl border bg-white p-3 dark:bg-surface",
                emp.status === "late" ? "border-[var(--brand)]" : "border-border",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white"
                  style={{
                    background:
                      emp.status === "late"
                        ? "#BA7517"
                        : emp.status === "onboarding_j1"
                          ? "#0E0E0E"
                          : brand.primaryColor,
                  }}
                >
                  {emp.initials}
                </span>
                <div>
                  <p className="text-sm font-black text-foreground">{emp.fullName}</p>
                  <p className="text-[10px] text-foreground-muted">{emp.role}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", badge.className)}>
                  {badge.label}
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${emp.trainingPercent}%`, background: brand.primaryColor }}
                  />
                </div>
                <span className="text-[10px] font-bold text-foreground-muted">{emp.trainingPercent}%</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
