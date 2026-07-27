"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { Check, Loader2, Lock, Star } from "lucide-react";
import {
  signAndCompleteReviewAction,
  submitManagerReviewAction,
} from "@/lib/actions/reviews";
import type { QuarterlyReviewCard } from "@/lib/data/reviews";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.reviews.errors.unauthorized,
    invalid_score: dict.reviews.errors.invalidScore,
    invalid_signature: dict.reviews.errors.invalidSignature,
    invalid_status: dict.reviews.errors.invalidStatus,
    not_found: dict.reviews.errors.notFound,
    employee_not_signed: dict.reviews.errors.employeeNotSigned,
    database_error: dict.reviews.errors.databaseError,
  };
  return map[code] ?? dict.reviews.errors.databaseError;
}

function statusTone(status: QuarterlyReviewCard["status"]): "neutral" | "accent" | "warning" {
  if (status === "SIGNED_AND_COMPLETED") return "accent";
  if (status === "READY_FOR_REVIEW") return "warning";
  return "neutral";
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
          >
            <Star
              className={cn("h-4 w-4", n <= value ? "fill-warning text-warning" : "text-border")}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreCompare({
  label,
  employee,
  manager,
  feedback,
  dict,
}: {
  label: string;
  employee: number | null;
  manager: number | null;
  feedback?: number | null;
  dict: Dictionary;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-center text-[10px]">
      <p className="font-semibold text-foreground-muted">{label}</p>
      <p className="mt-0.5 tabular-nums text-foreground">
        {dict.reviews.compareSelf}: {employee ?? "—"} · {dict.reviews.compareManager}: {manager ?? "—"}
        {feedback != null && (
          <>
            <br />
            {dict.reviews.compareFeedback}: {feedback.toFixed(1)}
          </>
        )}
      </p>
    </div>
  );
}

function ManagerReviewItem({
  review,
  dict,
  lang,
  defaultSignature,
}: {
  review: QuarterlyReviewCard;
  dict: Dictionary;
  lang: Locale;
  defaultSignature: string;
}) {
  const [attitude, setAttitude] = useState(review.managerAttitude ?? 0);
  const [culture, setCulture] = useState(review.managerCulture ?? 0);
  const [station, setStation] = useState(review.managerStation ?? 0);
  const [comments, setComments] = useState(review.managerComments ?? "");
  const [goals, setGoals] = useState(review.futureGoals ?? "");
  const [signature, setSignature] = useState(defaultSignature);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(review.status);
  const [isPending, startTransition] = useTransition();

  const periodLabel = format(new Date(review.periodEndDate), "d MMM yyyy", {
    locale: dateFnsLocales[lang],
  });

  function saveManagerInput() {
    if (attitude < 1 || culture < 1 || station < 1) return;
    setError(null);
    startTransition(async () => {
      const result = await submitManagerReviewAction({
        reviewId: review.id,
        attitude,
        culture,
        station,
        comments: comments || undefined,
        goals: goals || undefined,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setLocalStatus("READY_FOR_REVIEW");
    });
  }

  function signComplete() {
    if (signature.trim().length < 2) return;
    setError(null);
    startTransition(async () => {
      const result = await signAndCompleteReviewAction({
        reviewId: review.id,
        signatureName: signature,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setLocalStatus("SIGNED_AND_COMPLETED");
    });
  }

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{review.employeeName}</h3>
          <p className="text-xs text-foreground-muted">
            {dict.reviews.periodLabel.replace("{date}", periodLabel)}
          </p>
        </div>
        <Badge tone={statusTone(localStatus)}>{dict.reviews.status[localStatus]}</Badge>
      </div>

      {review.feedback.count > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.reviews.feedbackSummary}
          </p>
          <p className="mt-1 text-sm tabular-nums">
            {dict.reviews.feedbackOverall.replace(
              "{score}",
              (review.feedback.overall ?? 0).toFixed(1),
            )}{" "}
            · {dict.reviews.feedbackCount.replace("{count}", String(review.feedback.count))}
          </p>
        </div>
      )}

      {(review.employeeSelfScore != null || review.managerScore != null) && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <ScoreCompare
            label={dict.reviews.criteria.attitude}
            employee={review.employeeAttitude}
            manager={localStatus === "PENDING_SELF_EVALUATION" ? null : attitude || review.managerAttitude}
            feedback={review.feedback.attitude}
            dict={dict}
          />
          <ScoreCompare
            label={dict.reviews.criteria.culture}
            employee={review.employeeCulture}
            manager={localStatus === "PENDING_SELF_EVALUATION" ? null : culture || review.managerCulture}
            dict={dict}
          />
          <ScoreCompare
            label={dict.reviews.criteria.station}
            employee={review.employeeStation}
            manager={localStatus === "PENDING_SELF_EVALUATION" ? null : station || review.managerStation}
            feedback={review.feedback.speed}
            dict={dict}
          />
        </div>
      )}

      {review.employeeComments && (
        <p className="mt-3 text-xs text-foreground-muted">
          <span className="font-semibold">{dict.reviews.employeeComments}: </span>
          {review.employeeComments}
        </p>
      )}

      {localStatus === "PENDING_SELF_EVALUATION" && (
        <p className="mt-3 text-xs text-warning">{dict.reviews.waitingSelfEval}</p>
      )}

      {(localStatus === "PENDING_MANAGER_INPUT" || localStatus === "READY_FOR_REVIEW") && (
        <div className="mt-4 space-y-2.5 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            {dict.reviews.managerSection}
          </p>
          <StarRow label={dict.reviews.criteria.attitude} value={attitude} onChange={setAttitude} disabled={isPending} />
          <StarRow label={dict.reviews.criteria.culture} value={culture} onChange={setCulture} disabled={isPending} />
          <StarRow label={dict.reviews.criteria.station} value={station} onChange={setStation} disabled={isPending} />
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value.slice(0, 2000))}
            disabled={isPending}
            rows={2}
            placeholder={dict.reviews.managerCommentsPlaceholder}
            className="w-full resize-none rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
          />
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value.slice(0, 2000))}
            disabled={isPending}
            rows={2}
            placeholder={dict.reviews.goalsPlaceholder}
            className="w-full resize-none rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
          />

          {localStatus === "PENDING_MANAGER_INPUT" && (
            <Button
              type="button"
              size="sm"
              disabled={isPending || attitude < 1 || culture < 1 || station < 1}
              onClick={saveManagerInput}
            >
              {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {dict.reviews.saveManagerEval}
            </Button>
          )}

          {localStatus === "READY_FOR_REVIEW" && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-foreground-muted">
                {dict.reviews.signatureLabel}
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  disabled={isPending}
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>
              <Button type="button" size="sm" disabled={isPending || signature.trim().length < 2} onClick={signComplete}>
                {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Lock className="mr-1.5 h-3.5 w-3.5" />}
                {dict.reviews.signAndSeal}
              </Button>
            </div>
          )}
        </div>
      )}

      {localStatus === "SIGNED_AND_COMPLETED" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-success">
          <Check className="h-4 w-4" aria-hidden />
          {dict.reviews.sealed}
          {review.futureGoals && (
            <span className="text-xs text-foreground-muted"> — {review.futureGoals}</span>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </article>
  );
}

export function ManagerReviewsDashboard({
  reviews,
  dict,
  lang,
  defaultSignature,
}: {
  reviews: QuarterlyReviewCard[];
  dict: Dictionary;
  lang: Locale;
  defaultSignature: string;
}) {
  if (reviews.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface-muted px-4 py-8 text-center text-sm text-foreground-muted">
        {dict.reviews.empty}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <ManagerReviewItem
          key={review.id}
          review={review}
          dict={dict}
          lang={lang}
          defaultSignature={defaultSignature}
        />
      ))}
    </div>
  );
}
