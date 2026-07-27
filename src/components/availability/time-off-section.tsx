"use client";

import { useState, useTransition } from "react";
import { CalendarRange, Check } from "lucide-react";
import { requestTimeOff } from "@/lib/actions/timeoff";
import type { TimeOffRequestEntry } from "@/lib/data/timeoff";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { RequestStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-50";

function statusTone(status: RequestStatus): "neutral" | "accent" | "success" | "danger" | "warning" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  return "warning";
}

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    profile_not_found: dict.timeOff.errors.profileNotFound,
    database_error: dict.timeOff.errors.databaseError,
    unauthorized: dict.timeOff.errors.unauthorized,
    past_date_invalid: dict.timeOff.errors.pastDateInvalid,
    invalid_range: dict.timeOff.errors.invalidRange,
    missing_fields: dict.timeOff.errors.missingFields,
  };
  return map[code] ?? dict.timeOff.errors.databaseError;
}

function formatDateRange(start: string, end: string, locale: Locale) {
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const startLabel = fmt.format(new Date(`${start}T12:00:00`));
  const endLabel = fmt.format(new Date(`${end}T12:00:00`));
  return start === end ? startLabel : `${startLabel} → ${endLabel}`;
}

export function TimeOffSection({
  lang,
  dict,
  initialRequests,
}: {
  lang: Locale;
  dict: Dictionary;
  initialRequests: TimeOffRequestEntry[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitted(false);

    startTransition(async () => {
      const result = await requestTimeOff({ lang, startDate, endDate, reason });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }

      const optimistic: TimeOffRequestEntry = {
        id: `tmp-${Date.now()}`,
        startDate,
        endDate,
        reason: reason.trim() || null,
        status: "PENDING",
        reviewedAt: null,
        createdAt: new Date().toISOString(),
        employeeName: "—",
        employeeId: "—",
        reviewerName: null,
      };
      setRequests((prev) => [optimistic, ...prev]);
      setStartDate("");
      setEndDate("");
      setReason("");
      setSubmitted(true);
    });
  }

  return (
    <section className="space-y-4 border-t border-border px-4 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="text-base font-semibold">{dict.timeOff.title}</h2>
      </div>
      <p className="text-sm text-foreground-muted">{dict.timeOff.subtitle}</p>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <p className="text-sm font-medium">{dict.timeOff.newRequest}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-muted">{dict.timeOff.startDate}</label>
            <input
              type="date"
              required
              disabled={isPending}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground-muted">{dict.timeOff.endDate}</label>
            <input
              type="date"
              required
              disabled={isPending}
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground-muted">{dict.timeOff.reason}</label>
          <input
            type="text"
            disabled={isPending}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={dict.timeOff.reasonPlaceholder}
            className={inputClass}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {submitted && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" aria-hidden />
            {dict.timeOff.submitted}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full rounded-xl" disabled={isPending || !startDate || !endDate}>
          {isPending ? dict.timeOff.submitting : dict.timeOff.submitRequest}
        </Button>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{dict.timeOff.history}</h3>
        {requests.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-muted px-4 py-6 text-center text-sm text-foreground-muted">
            {dict.timeOff.emptyHistory}
          </p>
        ) : (
          requests.map((request) => (
            <article
              key={request.id}
              className={cn(
                "rounded-xl border px-4 py-3",
                request.status === "PENDING" ? "border-warning/30 bg-warning/5" : "border-border bg-surface",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{formatDateRange(request.startDate, request.endDate, lang)}</p>
                <Badge tone={statusTone(request.status)}>{dict.timeOff.status[request.status]}</Badge>
              </div>
              {request.reason && <p className="mt-1 text-sm text-foreground-muted">{request.reason}</p>}
              {request.reviewerName && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {dict.timeOff.reviewedBy} {request.reviewerName}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
