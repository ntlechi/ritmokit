"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";
import { reviewTimeOffRequest } from "@/lib/actions/timeoff";
import type { TimeOffRequestEntry } from "@/lib/data/timeoff";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.timeOff.errors.unauthorized,
    database_error: dict.timeOff.errors.databaseError,
    already_reviewed: dict.timeOff.errors.alreadyReviewed,
  };
  return map[code] ?? dict.timeOff.errors.databaseError;
}

function formatDateRange(start: string, end: string, locale: Locale) {
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const startLabel = fmt.format(new Date(`${start}T12:00:00`));
  const endLabel = fmt.format(new Date(`${end}T12:00:00`));
  return start === end ? startLabel : `${startLabel} → ${endLabel}`;
}

export function TimeOffRequestsPanel({
  lang,
  dict,
  initialPending,
}: {
  lang: Locale;
  dict: Dictionary;
  initialPending: TimeOffRequestEntry[];
}) {
  const [pending, setPending] = useState(initialPending);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleReview(requestId: string, status: "APPROVED" | "REJECTED") {
    setError(null);
    setActiveId(requestId);

    startTransition(async () => {
      const result = await reviewTimeOffRequest({ lang, requestId, status });
      setActiveId(null);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setPending((prev) => prev.filter((row) => row.id !== requestId));
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200/80 px-4 py-4 dark:border-white/10 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/${lang}/team`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:bg-zinc-100 dark:hover:bg-white/5"
            aria-label={dict.team.title}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.team.requests}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">{dict.timeOff.pendingQueue}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-3 px-4 py-5 sm:px-6">
        {error && <p className="text-sm text-danger">{error}</p>}

        {pending.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200/80 bg-zinc-50 px-6 py-8 text-center text-sm text-foreground-muted dark:border-white/10 dark:bg-white/5">
            {dict.timeOff.emptyQueue}
          </p>
        ) : (
          pending.map((request) => {
            const busy = isPending && activeId === request.id;
            return (
              <article
                key={request.id}
                className="rounded-2xl border border-warning/30 bg-white p-4 shadow-xs dark:bg-zinc-900/60"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{request.employeeName}</p>
                    <p className="mt-0.5 text-sm text-foreground-muted">
                      {formatDateRange(request.startDate, request.endDate, lang)}
                    </p>
                  </div>
                  <Badge tone="warning">{dict.timeOff.status.PENDING}</Badge>
                </div>
                {request.reason && (
                  <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-white/5">{request.reason}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1 rounded-xl"
                    disabled={busy}
                    onClick={() => handleReview(request.id, "APPROVED")}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    {busy ? dict.timeOff.reviewing : dict.timeOff.approve}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="flex-1 rounded-xl"
                    disabled={busy}
                    onClick={() => handleReview(request.id, "REJECTED")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    {busy ? dict.timeOff.reviewing : dict.timeOff.reject}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}
