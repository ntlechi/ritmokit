"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Beaker, Check, Loader2, Play, X } from "lucide-react";
import {
  applyProductExperimentAction,
  concludeProductExperimentAction,
  rejectProductExperimentAction,
  startProductExperimentAction,
} from "@/lib/actions/rsi-experiments";
import type { ExperimentDashboardRow } from "@/lib/rsi/platform-experiments";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RsiExperimentCards({
  experiments,
  organizationId,
  dict,
}: {
  experiments: ExperimentDashboardRow[];
  organizationId: string;
  dict: Dictionary;
}) {
  if (experiments.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Beaker className="h-4 w-4 text-accent" aria-hidden />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.culture.rsiExperiments.badge}
          </p>
          <h2 className="text-sm font-semibold">{dict.culture.rsiExperiments.title}</h2>
        </div>
      </div>
      <p className="text-xs text-foreground-muted">{dict.culture.rsiExperiments.subtitle}</p>
      <ul className="space-y-3">
        {experiments.map((exp) => (
          <li key={exp.id}>
            <ExperimentCard experiment={exp} organizationId={organizationId} dict={dict} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExperimentCard({
  experiment,
  organizationId,
  dict,
}: {
  experiment: ExperimentDashboardRow;
  organizationId: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function mapError(code: string) {
    const map: Record<string, string> = {
      unauthorized: dict.culture.rsiExperiments.errors.unauthorized,
      not_found: dict.culture.rsiExperiments.errors.notFound,
      invalid_status: dict.culture.rsiExperiments.errors.invalidStatus,
      invalid_hypothesis: dict.culture.rsiExperiments.errors.invalidHypothesis,
      already_running: dict.culture.rsiExperiments.errors.alreadyRunning,
      no_locations: dict.culture.rsiExperiments.errors.noLocations,
      missing_window: dict.culture.rsiExperiments.errors.missingWindow,
      not_ended: dict.culture.rsiExperiments.errors.notEnded,
      database_error: dict.culture.rsiExperiments.errors.databaseError,
    };
    return map[code] ?? dict.culture.rsiExperiments.errors.databaseError;
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(mapError(result.error));
        return;
      }
      router.refresh();
    });
  }

  const statusLabel =
    dict.culture.rsiExperiments.status[
      experiment.status as keyof typeof dict.culture.rsiExperiments.status
    ] ?? experiment.status;

  const liftPct =
    experiment.liftRatio != null
      ? `${experiment.liftRatio >= 0 ? "+" : ""}${(experiment.liftRatio * 100).toFixed(0)} %`
      : null;

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Beaker className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {experiment.hypothesisKey}
        </p>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            experiment.status === "RUNNING" && "bg-accent-muted text-accent",
            experiment.status === "APPLIED" && "bg-success/15 text-success",
            experiment.status === "CONCLUDED_APPLIED" && "bg-warning/15 text-warning",
            (experiment.status === "DRAFT" || experiment.status === "CONCLUDED_REJECTED") &&
              "bg-surface-muted text-foreground-muted",
          )}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-2 text-sm leading-snug text-foreground">{experiment.description}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-foreground-muted">
        <div>
          <dt>{dict.culture.rsiExperiments.metric}</dt>
          <dd className="font-medium text-foreground">
            {dict.culture.rsiExperiments.metrics[
              experiment.targetMetric as keyof typeof dict.culture.rsiExperiments.metrics
            ] ?? experiment.targetMetric}
          </dd>
        </div>
        <div>
          <dt>{dict.culture.rsiExperiments.threshold}</dt>
          <dd className="font-medium text-foreground">
            +{(experiment.liftThreshold * 100).toFixed(0)} %
          </dd>
        </div>
        {(experiment.allocationCountA > 0 || experiment.allocationCountB > 0) && (
          <>
            <div>
              <dt>{dict.culture.rsiExperiments.cohortA}</dt>
              <dd className="font-medium text-foreground">
                {experiment.allocationCountA}
                {experiment.avgMetricA != null
                  ? ` · ${experiment.avgMetricA.toFixed(1)}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>{dict.culture.rsiExperiments.cohortB}</dt>
              <dd className="font-medium text-foreground">
                {experiment.allocationCountB}
                {experiment.avgMetricB != null
                  ? ` · ${experiment.avgMetricB.toFixed(1)}`
                  : ""}
                {liftPct ? ` (${liftPct})` : ""}
              </dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        {experiment.canStart && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={isPending}
            onClick={() =>
              run(() =>
                startProductExperimentAction(organizationId, experiment.hypothesisKey),
              )
            }
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="ml-1">{dict.culture.rsiExperiments.start}</span>
          </Button>
        )}
        {experiment.canConclude && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => concludeProductExperimentAction(experiment.id))}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Beaker className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="ml-1">{dict.culture.rsiExperiments.conclude}</span>
          </Button>
        )}
        {experiment.canReject && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => rejectProductExperimentAction(experiment.id))}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="ml-1">{dict.culture.rsiExperiments.reject}</span>
          </Button>
        )}
        {experiment.canApply && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={isPending}
            onClick={() => run(() => applyProductExperimentAction(experiment.id))}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="ml-1">{dict.culture.rsiExperiments.apply}</span>
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </article>
  );
}
