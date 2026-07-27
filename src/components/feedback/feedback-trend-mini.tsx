"use client";

import type { EmployeeFeedbackTrend } from "@/lib/data/feedback";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function FeedbackTrendMini({
  trend,
  dict,
  compact = false,
}: {
  trend: EmployeeFeedbackTrend;
  dict: Dictionary;
  compact?: boolean;
}) {
  if (trend.count === 0) {
    return (
      <p className="text-xs text-foreground-muted">{dict.feedback.trendEmpty}</p>
    );
  }

  const maxAvg = Math.max(...trend.points.map((p) => p.average), 1);

  return (
    <div className={cn("rounded-xl border border-border bg-surface-muted p-3", compact && "p-2")}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {dict.feedback.trendTitle}
        </p>
        <p className="metric text-sm font-semibold">
          {trend.averages.overall.toFixed(1)}
          <span className="text-xs font-normal text-foreground-muted"> / 5</span>
        </p>
      </div>

      <div className="mb-2 flex h-10 items-end gap-0.5">
        {trend.points.slice(-12).map((point, i) => (
          <div
            key={`${point.date}-${i}`}
            className="flex-1 rounded-t bg-accent/70"
            style={{ height: `${Math.max(12, (point.average / maxAvg) * 100)}%` }}
            title={`${point.average.toFixed(1)}`}
          />
        ))}
      </div>

      {!compact && (
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-foreground-muted">
          <div>
            <p className="font-semibold text-foreground">{trend.averages.attitude.toFixed(1)}</p>
            <p>{dict.feedback.attitudeShort}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">{trend.averages.speed.toFixed(1)}</p>
            <p>{dict.feedback.speedShort}</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">{trend.averages.reliability.toFixed(1)}</p>
            <p>{dict.feedback.reliabilityShort}</p>
          </div>
        </div>
      )}

      <p className="mt-1.5 text-[10px] text-foreground-muted">
        {dict.feedback.trendCount.replace("{count}", String(trend.count))}
      </p>
    </div>
  );
}
