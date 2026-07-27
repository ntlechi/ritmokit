"use client";

import type { getDemoTabletSnapshot } from "@/lib/demo/franchise-pitch";
import { Award, ClockAlert, FileCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Snapshot = ReturnType<typeof getDemoTabletSnapshot>;

export function AlertsTab({ snapshot }: { snapshot: Snapshot }) {
  const { alerts } = snapshot;

  const icons = {
    danger: ClockAlert,
    success: Award,
    warn: Users,
  } as const;

  if (alerts.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white p-6 text-center text-sm text-foreground-muted dark:bg-surface">
        Aucune alerte pour ce jour.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-foreground-muted">
        Alertes du quart
      </p>
      {alerts.map((a) => {
        const Icon = a.tone === "success" ? FileCheck : icons[a.tone];
        return (
          <article
            key={a.id}
            className="flex gap-2.5 rounded-xl border border-border bg-white p-3 dark:bg-surface"
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                a.tone === "danger" && "text-danger",
                a.tone === "success" && "text-success",
                a.tone === "warn" && "text-warning",
              )}
              aria-hidden
            />
            <div>
              <p className="text-xs font-bold text-foreground">{a.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-foreground-muted">{a.body}</p>
              <p className="mt-1 text-[10px] text-zinc-400">
                {a.minutesAgo < 60
                  ? `Il y a ${a.minutesAgo} min`
                  : `Il y a ${Math.round(a.minutesAgo / 60)} h`}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
