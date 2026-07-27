"use client";

import { useState, useTransition } from "react";
import { Check, ClipboardCheck, Loader2, Star } from "lucide-react";
import { submitEmployeeSelfEvaluationAction } from "@/lib/actions/reviews";
import type { QuarterlyReviewCard } from "@/lib/data/reviews";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.reviews.errors.unauthorized,
    invalid_score: dict.reviews.errors.invalidScore,
    invalid_signature: dict.reviews.errors.invalidSignature,
    invalid_status: dict.reviews.errors.invalidStatus,
    database_error: dict.reviews.errors.databaseError,
  };
  return map[code] ?? dict.reviews.errors.databaseError;
}

function StarRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-foreground-muted">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className="rounded p-0.5 disabled:opacity-50"
            aria-label={`${label}: ${n}`}
          >
            <Star
              className={cn("h-5 w-5", n <= value ? "fill-warning text-warning" : "text-border")}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmployeeSelfEvalCard({
  review,
  dict,
  defaultSignature,
}: {
  review: QuarterlyReviewCard;
  dict: Dictionary;
  lang: Locale;
  defaultSignature: string;
}) {
  const [attitude, setAttitude] = useState(0);
  const [culture, setCulture] = useState(0);
  const [station, setStation] = useState(0);
  const [comments, setComments] = useState("");
  const [signature, setSignature] = useState(defaultSignature);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (review.status !== "PENDING_SELF_EVALUATION") {
    return (
      <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
        <ClipboardCheck className="mb-1 inline h-4 w-4" aria-hidden />{" "}
        {dict.reviews.employeeWaitingManager}
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
        <Check className="h-4 w-4" aria-hidden />
        {dict.reviews.selfEvalSubmitted}
      </div>
    );
  }

  const ready = attitude > 0 && culture > 0 && station > 0 && signature.trim().length >= 2;

  function submit() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await submitEmployeeSelfEvaluationAction({
        reviewId: review.id,
        attitude,
        culture,
        station,
        comments: comments || undefined,
        signatureName: signature,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setDone(true);
    });
  }

  const periodLabel = new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(review.periodEndDate));

  return (
    <article className="rounded-2xl border border-accent/25 bg-accent/5 p-4 shadow-sm">
      <p className="text-sm font-semibold">{dict.reviews.selfEvalTitle}</p>
      <p className="mt-0.5 text-xs text-foreground-muted">
        {dict.reviews.periodLabel.replace("{date}", periodLabel)}
      </p>

      <div className="mt-3 space-y-2.5">
        <StarRow label={dict.reviews.criteria.attitude} value={attitude} onChange={setAttitude} disabled={isPending} />
        <StarRow label={dict.reviews.criteria.culture} value={culture} onChange={setCulture} disabled={isPending} />
        <StarRow label={dict.reviews.criteria.station} value={station} onChange={setStation} disabled={isPending} />
      </div>

      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value.slice(0, 2000))}
        disabled={isPending}
        rows={3}
        placeholder={dict.reviews.commentsPlaceholder}
        className="mt-3 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />

      <label className="mt-2 block text-xs font-medium text-foreground-muted">
        {dict.reviews.signatureLabel}
        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          disabled={isPending}
          className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        />
      </label>
      <p className="mt-1 text-[10px] text-foreground-muted">{dict.reviews.signatureHint}</p>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <Button type="button" size="sm" className="mt-3 w-full" disabled={!ready || isPending} onClick={submit}>
        {isPending ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            {dict.reviews.submitting}
          </>
        ) : (
          dict.reviews.submitSelfEval
        )}
      </Button>
    </article>
  );
}
