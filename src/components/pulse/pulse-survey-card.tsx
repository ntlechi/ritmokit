"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  dismissPulsePromptAction,
  submitPulseResponseAction,
} from "@/lib/actions/pulse";
import type { PulsePrompt } from "@/lib/data/pulse";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.pulse.errors.unauthorized,
    invalid_score: dict.pulse.errors.invalidScore,
    invalid_station: dict.pulse.errors.invalidStation,
    question_not_found: dict.pulse.errors.questionNotFound,
    question_expired: dict.pulse.errors.questionExpired,
    already_submitted: dict.pulse.errors.alreadySubmitted,
    database_error: dict.pulse.errors.databaseError,
  };
  return map[code] ?? dict.pulse.errors.databaseError;
}

export function PulseSurveyCard({
  prompt,
  dict,
}: {
  prompt: PulsePrompt;
  dict: Dictionary;
}) {
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (score < 1) return;
    setError(null);
    startTransition(async () => {
      const result = await submitPulseResponseAction({
        questionId: prompt.questionId,
        locationId: prompt.locationId,
        stationId: prompt.stationId,
        score,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setDone(true);
    });
  }

  function skip() {
    setError(null);
    startTransition(async () => {
      const result = await dismissPulsePromptAction({ questionId: prompt.questionId });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-success/25 bg-success/5 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-success">
          <Check className="h-4 w-4" aria-hidden />
          <p className="text-sm font-semibold">{dict.pulse.thanks}</p>
        </div>
        <p className="mt-1 text-xs text-foreground-muted">{dict.pulse.anonymousHint}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
        {dict.pulse.badge}
      </p>
      <h2 className="mt-1 text-base font-semibold tracking-tight">{dict.pulse.title}</h2>
      <p className="mt-2 text-sm text-foreground">{prompt.text}</p>
      <p className="mt-1 text-xs text-foreground-muted">{dict.pulse.anonymousHint}</p>

      <div className="mt-4 flex justify-between gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={isPending}
            onClick={() => setScore(n)}
            aria-label={`${dict.pulse.scoreLabel} ${n}`}
            aria-pressed={score === n}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-transform hover:scale-105 disabled:opacity-50",
              score === n
                ? "border-accent bg-accent text-white shadow-sm"
                : "border-border bg-surface-muted text-foreground-muted hover:border-accent/40 hover:text-foreground",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between px-0.5 text-[10px] text-foreground-muted">
        <span>{dict.pulse.lowLabel}</span>
        <span>{dict.pulse.highLabel}</span>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={isPending || score < 1}
          onClick={submit}
        >
          {isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          {dict.pulse.submit}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={skip}>
          {dict.pulse.skip}
        </Button>
      </div>
    </section>
  );
}
