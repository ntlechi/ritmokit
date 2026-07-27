import { Cpu } from "lucide-react";
import type { AutopilotLoopRunView } from "@/lib/autopilot/sync";
import { autopilotLoopLabel } from "@/lib/autopilot/sync";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function AutopilotLoopPanel({
  runs,
  dict,
  lang,
}: {
  runs: AutopilotLoopRunView[];
  dict: Dictionary;
  lang: Locale;
}) {
  if (runs.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-accent" aria-hidden />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.culture.autopilot.badge}
          </p>
          <h2 className="text-sm font-semibold">{dict.culture.autopilot.title}</h2>
        </div>
      </div>
      <p className="mt-1 text-xs text-foreground-muted">{dict.culture.autopilot.subtitle}</p>
      <ul className="mt-4 space-y-2">
        {runs.map((run) => (
          <li
            key={run.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-muted px-3 py-2.5"
          >
            <div>
              <p className="text-xs font-semibold">{autopilotLoopLabel(run.loopKind, lang)}</p>
              <p className="text-[11px] text-foreground-muted">
                {run.metricName}
                {run.metricValue != null && `: ${formatMetric(run.metricValue)}`}
                {run.targetValue != null && ` → cible ${formatMetric(run.targetValue)}`}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                run.outcome === "PROPOSED" && "bg-accent-muted text-accent",
                run.outcome === "NO_ACTION" && "bg-surface text-foreground-muted",
                run.outcome === "MEASURED" && "bg-surface text-foreground-muted",
                run.outcome === "FAILED" && "bg-danger/10 text-danger",
              )}
            >
              {dict.culture.autopilot.outcomes[run.outcome] ?? run.outcome}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatMetric(value: number): string {
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
