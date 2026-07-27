"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { AlertTriangle, Check, ClipboardList, Loader2, UserPlus } from "lucide-react";
import {
  assignBuddyAndGenerateChecklistAction,
  completeOnboardingTaskAction,
} from "@/lib/actions/hr-excellence";
import type { ManagerOnboardingDashboard } from "@/lib/data/hr-excellence";
import type { EmployeeFeedbackTrend } from "@/lib/data/feedback";
import type { OnboardingTaskKey } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { FeedbackTrendMini } from "@/components/feedback/feedback-trend-mini";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

function taskLabel(dict: Dictionary, key: OnboardingTaskKey): string {
  return dict.manager.integration.tasks[key];
}

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.manager.integration.errors.unauthorized,
    database_error: dict.manager.integration.errors.databaseError,
    recruit_not_found: dict.manager.integration.errors.recruitNotFound,
    buddy_not_found: dict.manager.integration.errors.buddyNotFound,
    invalid_buddy: dict.manager.integration.errors.invalidBuddy,
    task_not_found: dict.manager.integration.errors.taskNotFound,
    failed_to_initialize_integration: dict.manager.integration.errors.initFailed,
  };
  return map[code] ?? dict.manager.integration.errors.databaseError;
}

export function ManagerOnboardingDashboardView({
  data,
  buddyCandidates,
  feedbackTrends,
  dict,
  lang,
}: {
  data: ManagerOnboardingDashboard;
  buddyCandidates: { userId: string; fullName: string }[];
  feedbackTrends?: Map<string, EmployeeFeedbackTrend>;
  dict: Dictionary;
  lang: Locale;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [pendingRecruitId, setPendingRecruitId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleTask(taskId: string, completed: boolean) {
    setError(null);
    setPendingTaskId(taskId);
    startTransition(async () => {
      const result = await completeOnboardingTaskAction({
        locationId: data.locationId,
        taskId,
        completed,
      });
      setPendingTaskId(null);
      if (!result.ok) setError(resolveError(dict, result.error));
    });
  }

  function assignBuddy(recruitUserId: string, buddyUserId: string) {
    if (!buddyUserId) return;
    setError(null);
    setPendingRecruitId(recruitUserId);
    startTransition(async () => {
      const result = await assignBuddyAndGenerateChecklistAction({
        locationId: data.locationId,
        recruitUserId,
        buddyUserId,
      });
      setPendingRecruitId(null);
      if (!result.ok) setError(resolveError(dict, result.error));
    });
  }

  if (data.recruits.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface-muted px-4 py-8 text-center text-sm text-foreground-muted">
        {dict.manager.integration.emptyRecruits}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {data.recruits.map((recruit) => (
        <article
          key={recruit.userId}
          className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold">{recruit.fullName}</h3>
              <p className="text-xs text-foreground-muted">
                {recruit.station} · {recruit.email}
              </p>
              {recruit.hiredAt && (
                <p className="mt-1 text-xs text-foreground-muted">
                  {dict.manager.integration.hiredOn.replace(
                    "{date}",
                    format(new Date(recruit.hiredAt), "d MMM yyyy", { locale: dateFnsLocales[lang] }),
                  )}
                </p>
              )}
              {recruit.hireAnchorMissing && (
                <p className="mt-1 text-xs font-medium text-danger">
                  {dict.manager.integration.hireAnchorMissing}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {recruit.hireAnchorMissing && (
                <Badge tone="danger">{dict.manager.integration.hireAnchorMissingBadge}</Badge>
              )}
              {!recruit.onboardingComplete && (
                <Badge tone="warning">{dict.manager.integration.onboardingInProgress}</Badge>
              )}
              {recruit.overdueCount > 0 && (
                <Badge tone="warning">
                  {dict.manager.integration.overdueBadge.replace("{count}", String(recruit.overdueCount))}
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              {dict.manager.integration.buddyLabel}
            </p>
            {recruit.buddyName ? (
              <p className="mt-1 text-sm font-medium">{recruit.buddyName}</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                  defaultValue=""
                  disabled={isPending && pendingRecruitId === recruit.userId}
                  onChange={(e) => assignBuddy(recruit.userId, e.target.value)}
                >
                  <option value="">{dict.manager.integration.selectBuddy}</option>
                  {buddyCandidates
                    .filter((c) => c.userId !== recruit.userId)
                    .map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.fullName}
                      </option>
                    ))}
                </select>
                {isPending && pendingRecruitId === recruit.userId && (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
                )}
              </div>
            )}
          </div>

          {feedbackTrends?.get(recruit.userId) && (
            <div className="mt-4">
              <FeedbackTrendMini trend={feedbackTrends.get(recruit.userId)!} dict={dict} />
            </div>
          )}

          <div className="mt-4 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              {dict.manager.integration.checklistTitle}
            </p>
            {recruit.tasks.length === 0 ? (
              <Button
                type="button"
                size="sm"
                disabled={isPending && pendingRecruitId === recruit.userId}
                onClick={() => {
                  setPendingRecruitId(recruit.userId);
                  startTransition(async () => {
                    const result = await assignBuddyAndGenerateChecklistAction({
                      locationId: data.locationId,
                      recruitUserId: recruit.userId,
                    });
                    setPendingRecruitId(null);
                    if (!result.ok) setError(resolveError(dict, result.error));
                  });
                }}
                className="gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                {dict.manager.integration.generateChecklist}
              </Button>
            ) : (
              <ul className="space-y-2">
                {recruit.tasks.map((task) => {
                  const done = Boolean(task.completedAt);
                  const loading = isPending && pendingTaskId === task.id;
                  return (
                    <li
                      key={task.id}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border px-3 py-2",
                        task.isOverdue && !done
                          ? "border-warning/40 bg-warning/5"
                          : "border-border bg-surface-muted",
                      )}
                    >
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => toggleTask(task.id, !done)}
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          done
                            ? "border-success bg-success text-white"
                            : "border-border bg-surface hover:border-accent",
                        )}
                        aria-label={done ? dict.manager.integration.markIncomplete : dict.manager.integration.markComplete}
                      >
                        {loading ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : done ? (
                          <Check className="h-3 w-3" aria-hidden />
                        ) : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm", done && "text-foreground-muted line-through")}>
                          {taskLabel(dict, task.taskKey)}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {dict.manager.integration.dueLabel.replace(
                            "{date}",
                            format(new Date(task.dueDate), "d MMM yyyy", { locale: dateFnsLocales[lang] }),
                          )}
                          {task.isOverdue && !done && (
                            <span className="ml-2 inline-flex items-center gap-0.5 text-warning">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              {dict.manager.integration.overdue}
                            </span>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
