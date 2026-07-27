"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Star } from "lucide-react";
import { submitShiftFeedbackAction } from "@/lib/actions/feedback";
import type { PendingFeedbackItem } from "@/lib/data/feedback";
import { formatTimeRange } from "@/lib/calendar/format";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.feedback.errors.unauthorized,
    shift_not_found: dict.feedback.errors.shiftNotFound,
    no_employee: dict.feedback.errors.noEmployee,
    not_clocked_out: dict.feedback.errors.notClockedOut,
    already_submitted: dict.feedback.errors.alreadySubmitted,
    cannot_self_rate: dict.feedback.errors.cannotSelfRate,
    invalid_rating: dict.feedback.errors.invalidRating,
    database_error: dict.feedback.errors.databaseError,
  };
  return map[code] ?? dict.feedback.errors.databaseError;
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
            className="rounded p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
            aria-label={`${label}: ${n}`}
          >
            <Star
              className={cn(
                "h-5 w-5",
                n <= value ? "fill-warning text-warning" : "text-border",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function FlashFeedbackCard({
  item,
  dict,
  lang,
  onDone,
}: {
  item: PendingFeedbackItem;
  dict: Dictionary;
  lang: Locale;
  onDone?: (shiftId: string) => void;
}) {
  const [attitude, setAttitude] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [reliability, setReliability] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ready = attitude > 0 && speed > 0 && reliability > 0;

  function submit() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await submitShiftFeedbackAction({
        shiftId: item.shiftId,
        ratingAttitude: attitude,
        ratingSpeed: speed,
        ratingReliability: reliability,
        comment: comment || undefined,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setDone(true);
      onDone?.(item.shiftId);
    });
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
        <Check className="h-4 w-4" aria-hidden />
        {dict.feedback.submitted}
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-sm font-semibold">{dict.feedback.flashTitle}</p>
        <p className="text-xs text-foreground-muted">
          {item.employeeName} · {item.stationNameFr} ·{" "}
          {formatTimeRange(new Date(item.startsAt), new Date(item.endsAt), lang)}
        </p>
      </div>

      <div className="space-y-2.5">
        <StarRow
          label={dict.feedback.attitude}
          value={attitude}
          onChange={setAttitude}
          disabled={isPending}
        />
        <StarRow
          label={dict.feedback.speed}
          value={speed}
          onChange={setSpeed}
          disabled={isPending}
        />
        <StarRow
          label={dict.feedback.reliability}
          value={reliability}
          onChange={setReliability}
          disabled={isPending}
        />
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 140))}
        disabled={isPending}
        rows={2}
        maxLength={140}
        placeholder={dict.feedback.commentPlaceholder}
        className="mt-3 w-full resize-none rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm placeholder:text-foreground-muted"
      />
      <p className="mt-0.5 text-right text-[10px] text-foreground-muted">{comment.length}/140</p>

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      <Button
        type="button"
        size="sm"
        className="mt-2 w-full"
        disabled={!ready || isPending}
        onClick={submit}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            {dict.feedback.submitting}
          </>
        ) : (
          dict.feedback.submit
        )}
      </Button>
    </article>
  );
}

export function PendingFeedbackQueue({
  items,
  dict,
  lang,
}: {
  items: PendingFeedbackItem[];
  dict: Dictionary;
  lang: Locale;
}) {
  const [queue, setQueue] = useState(items);

  if (queue.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{dict.feedback.queueTitle}</p>
        <p className="text-xs text-foreground-muted">
          {dict.feedback.queueSubtitle.replace("{count}", String(queue.length))}
        </p>
      </div>
      {queue.slice(0, 3).map((item) => (
        <FlashFeedbackCard
          key={item.shiftId}
          item={item}
          dict={dict}
          lang={lang}
          onDone={(shiftId) => setQueue((prev) => prev.filter((i) => i.shiftId !== shiftId))}
        />
      ))}
    </section>
  );
}
