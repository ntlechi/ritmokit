"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, X } from "lucide-react";
import {
  confirmDanceAgentAction,
  dismissDanceAgentAction,
} from "@/lib/actions/dance-agent-actions";
import type { DanceAgentAction } from "@/lib/dance/agent-action-types";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function AgentActionRail({
  actions,
  lang,
  dict,
}: {
  actions: DanceAgentAction[];
  lang: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const a = dict.accueil;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (actions.length === 0) return null;

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          setError(a.agentError);
          return;
        }
        router.refresh();
      } catch {
        setError(a.agentError);
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <section className="space-y-2" aria-label={a.agentRailTitle}>
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          {a.agentRailTitle}
        </h2>
        <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
          {actions.length}
        </span>
      </div>
      <p className="text-xs text-foreground-muted">{a.agentRailSubtitle}</p>

      <ul className="space-y-2">
        {actions.map((action) => {
          const busy = busyId === action.id;
          const tone =
            action.severity === "critical"
              ? "border-margin-alert/40 bg-margin-alert/10"
              : action.severity === "warning"
                ? "border-warning/40 bg-warning/10"
                : "border-border bg-surface";

          return (
            <li
              key={action.id}
              className={cn("rounded-2xl border px-3 py-3 sm:px-4", tone)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight">{action.title}</p>
                  <p className="mt-1 text-xs text-foreground-muted sm:text-sm">{action.body}</p>
                </div>
                {action.cta !== "none" && (
                  <button
                    type="button"
                    disabled={busy}
                    className="shrink-0 rounded-lg p-1.5 text-foreground-muted hover:bg-background/60"
                    aria-label={a.agentDismiss}
                    onClick={() =>
                      run(action.id, () =>
                        dismissDanceAgentAction({ agentLogId: action.id, lang }),
                      )
                    }
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>

              {action.cta === "confirm_soft_open" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-interactive
                    disabled={busy}
                    className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground"
                    onClick={() =>
                      run(action.id, () =>
                        confirmDanceAgentAction({ agentLogId: action.id, lang }),
                      )
                    }
                  >
                    {a.agentSoftOpen}
                  </button>
                  <button
                    type="button"
                    data-interactive
                    disabled={busy}
                    className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
                    onClick={() =>
                      run(action.id, () =>
                        dismissDanceAgentAction({ agentLogId: action.id, lang }),
                      )
                    }
                  >
                    {a.agentDismiss}
                  </button>
                </div>
              )}

              {action.uiKind === "churn_risk" && (
                <p className="mt-2 text-[11px] text-foreground-muted">{a.agentChurnHint}</p>
              )}
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-sm text-margin-alert">{error}</p> : null}
    </section>
  );
}
