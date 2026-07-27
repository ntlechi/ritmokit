"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bot, Check, Loader2, X } from "lucide-react";
import { resolveAgentPlaybookProposalAction } from "@/lib/actions/rsi-agents";
import type { SuggestedPlaybookView } from "@/lib/rsi/agent-performance";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RsiPlaybookCards({
  proposals,
  dict,
}: {
  proposals: SuggestedPlaybookView[];
  dict: Dictionary;
}) {
  if (proposals.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-accent" aria-hidden />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.culture.rsiAgents.badge}
          </p>
          <h2 className="text-sm font-semibold">{dict.culture.rsiAgents.title}</h2>
        </div>
      </div>
      <p className="text-xs text-foreground-muted">{dict.culture.rsiAgents.subtitle}</p>
      <ul className="space-y-3">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <PlaybookCard proposal={proposal} dict={dict} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlaybookCard({
  proposal,
  dict,
}: {
  proposal: SuggestedPlaybookView;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resolve(status: "APPROVED" | "REJECTED") {
    setError(null);
    startTransition(async () => {
      const result = await resolveAgentPlaybookProposalAction(proposal.id, status);
      if (!result.ok) {
        const map: Record<string, string> = {
          unauthorized: dict.culture.rsiAgents.errors.unauthorized,
          not_found: dict.culture.rsiAgents.errors.notFound,
          already_resolved: dict.culture.rsiAgents.errors.alreadyResolved,
          invalid_status: dict.culture.rsiAgents.errors.invalidStatus,
          invalid_agent: dict.culture.rsiAgents.errors.invalidAgent,
          invalid_config: dict.culture.rsiAgents.errors.invalidConfig,
          database_error: dict.culture.rsiAgents.errors.databaseError,
        };
        setError(map[result.error] ?? dict.culture.rsiAgents.errors.databaseError);
        return;
      }
      router.refresh();
    });
  }

  const agentLabel =
    dict.culture.rsiAgents.agents[proposal.agentName] ?? proposal.agentName;

  const patchLines = summarizePatch(proposal.currentConfig, proposal.proposedConfig);

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {agentLabel}
        </p>
      </div>
      <p className="mt-2 text-sm leading-snug text-foreground">{proposal.rationale}</p>
      {patchLines.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl border border-border-subtle bg-surface-muted px-3 py-2">
          {patchLines.map((line) => (
            <li key={line} className="font-mono text-[11px] text-foreground-muted">
              {line}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => resolve("REJECTED")}
          aria-label={dict.culture.rsiAgents.reject}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="ml-1">{dict.culture.rsiAgents.reject}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={isPending}
          onClick={() => resolve("APPROVED")}
          aria-label={dict.culture.rsiAgents.approve}
          className={cn(isPending && "opacity-70")}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="ml-1">{dict.culture.rsiAgents.approve}</span>
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </article>
  );
}

function summarizePatch(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): string[] {
  const keys = Array.from(new Set([...Object.keys(current), ...Object.keys(proposed)]));
  return keys
    .filter((key) => current[key] !== proposed[key])
    .map((key) => `${key}: ${formatVal(current[key])} → ${formatVal(proposed[key])}`);
}

function formatVal(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value == null) return "—";
  return String(value);
}
