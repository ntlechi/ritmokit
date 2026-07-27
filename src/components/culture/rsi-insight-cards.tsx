"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Check,
  Lightbulb,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { updateInsightStatusAction } from "@/lib/actions/rsi";
import type { OpenInsightView } from "@/lib/rsi/insights";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function severityTone(severity: OpenInsightView["severity"]): string {
  if (severity === "HIGH") return "border-danger/35 bg-danger/5";
  if (severity === "MEDIUM") return "border-warning/35 bg-warning/5";
  return "border-accent/30 bg-accent-muted/30";
}

function severityLabel(
  severity: OpenInsightView["severity"],
  dict: Dictionary,
): string {
  return dict.culture.rsi.severity[severity];
}

function typeLabel(type: OpenInsightView["type"], dict: Dictionary): string {
  return dict.culture.rsi.types[type];
}

export function RsiInsightCards({
  insights,
  dict,
  lang,
}: {
  insights: OpenInsightView[];
  dict: Dictionary;
  lang: Locale;
}) {
  if (insights.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-accent" aria-hidden />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.culture.rsi.badge}
          </p>
          <h2 className="text-sm font-semibold">{dict.culture.rsi.title}</h2>
        </div>
      </div>
      <p className="text-xs text-foreground-muted">{dict.culture.rsi.subtitle}</p>
      <ul className="space-y-3">
        {insights.map((insight) => (
          <li key={insight.id}>
            <InsightCard insight={insight} dict={dict} lang={lang} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InsightCard({
  insight,
  dict,
  lang,
}: {
  insight: OpenInsightView;
  dict: Dictionary;
  lang: Locale;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const href = `/${lang}${insight.actionLink}`;

  function resolve(status: "APPLIED" | "DISMISSED") {
    setError(null);
    startTransition(async () => {
      const result = await updateInsightStatusAction(insight.id, status);
      if (!result.ok) {
        const map: Record<string, string> = {
          unauthorized: dict.culture.rsi.errors.unauthorized,
          not_found: dict.culture.rsi.errors.notFound,
          already_resolved: dict.culture.rsi.errors.alreadyResolved,
          invalid_status: dict.culture.rsi.errors.invalidStatus,
          database_error: dict.culture.rsi.errors.databaseError,
        };
        setError(map[result.error] ?? dict.culture.rsi.errors.databaseError);
        return;
      }
      router.refresh();
    });
  }

  return (
    <article
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        severityTone(insight.severity),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {insight.type === "SHOUTOUT_SPIKE" ? (
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
            ) : (
              <Lightbulb className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />
            )}
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              {typeLabel(insight.type, dict)}
            </p>
            <span className="rounded-md bg-surface/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
              {severityLabel(insight.severity, dict)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-snug text-foreground">
            {insight.suggestedAction}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={href}
          className="inline-flex text-xs font-medium text-accent hover:underline"
        >
          {dict.culture.rsi.openModule} →
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => resolve("DISMISSED")}
            aria-label={dict.culture.rsi.dismiss}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="ml-1">{dict.culture.rsi.dismiss}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={isPending}
            onClick={() => resolve("APPLIED")}
            aria-label={dict.culture.rsi.apply}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="ml-1">{dict.culture.rsi.apply}</span>
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </article>
  );
}
