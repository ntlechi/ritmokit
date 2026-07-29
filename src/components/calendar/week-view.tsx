"use client";

import { memo, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { ShiftChip } from "@/components/calendar/shift-chip";
import { ReplacementFinderTrigger } from "@/components/calendar/replacement-finder-trigger";
import { ReportSicknessTrigger } from "@/components/calendar/report-sickness-trigger";
import type { SicknessFlowResult } from "@/components/calendar/report-sickness-trigger";
import { UserAvatar } from "@/components/ui/user-avatar";
import { reassignShiftAction } from "@/lib/actions/shifts";
import { deleteDraftShiftAction } from "@/lib/actions/auto-schedule";
import type { EmployeeRosterEntry } from "@/lib/data/employees";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { isSameDay } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

/** Au-delà, la rangée « Non assigné » se replie derrière un bouton +N. */
const MAX_UNASSIGNED_VISIBLE = 3;

function dayKey(employeeId: string, day: Date) {
  return `${employeeId}::${day.toDateString()}`;
}

function resolveDragError(dict: Dictionary, code: string): string {
  const map = dict.schedule.dragErrors;
  if (code === "unauthorized") return map.unauthorized;
  if (code === "not_draft") return map.notDraft;
  if (code === "shift_not_found") return map.shiftNotFound;
  if (code === "employee_not_found") return map.employeeNotFound;
  if (code === "invalid_date") return map.invalidDate;
  if (code === "shift_conflict") return map.shiftConflict;
  if (code.startsWith("CNESST:")) return code;
  return map.databaseError;
}

export function WeekView({
  days,
  roster,
  shifts,
  locale,
  dict,
  planningMode = false,
  unassignedInRow = true,
  onShiftsChange,
  onOpenReplacement,
  onSicknessSuccess,
}: {
  days: Date[];
  roster: EmployeeRosterEntry[];
  shifts: ShiftWithEmployee[];
  locale: Locale;
  dict: Dictionary;
  /** Mode planification : seuls les quarts DRAFT sont déplaçables. */
  planningMode?: boolean;
  /** Masque la rangée « Non assigné » quand un tiroir dédié gère les orphelins. */
  unassignedInRow?: boolean;
  onShiftsChange?: (shifts: ShiftWithEmployee[]) => void;
  onOpenReplacement?: (shift: ShiftWithEmployee) => void;
  onSicknessSuccess?: (result: SicknessFlowResult, shift: ShiftWithEmployee) => void;
}) {
  const isControlled = onShiftsChange != null;
  const [internalShifts, setInternalShifts] = useState(shifts);
  const localShifts = isControlled ? shifts : internalShifts;

  useEffect(() => {
    if (!isControlled) setInternalShifts(shifts);
  }, [shifts, isControlled]);

  const [isPending, startTransition] = useTransition();
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUnassigned, setExpandedUnassigned] = useState<Set<string>>(new Set());
  const today = new Date();

  function toggleUnassignedDay(key: string) {
    setExpandedUnassigned((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const cells = useMemo(() => {
    const map = new Map<string, ShiftWithEmployee[]>();
    for (const shift of localShifts) {
      if (!shift.employeeId) continue;
      const key = dayKey(shift.employeeId, shift.startsAt);
      const bucket = map.get(key) ?? [];
      bucket.push(shift);
      map.set(key, bucket);
    }
    return map;
  }, [localShifts]);

  const unassignedByDay = useMemo(() => {
    const map = new Map<string, ShiftWithEmployee[]>();
    for (const shift of localShifts) {
      if (shift.employeeId) continue;
      const key = shift.startsAt.toDateString();
      const bucket = map.get(key) ?? [];
      bucket.push(shift);
      map.set(key, bucket);
    }
    return map;
  }, [localShifts]);

  const hasUnassigned = unassignedInRow && (unassignedByDay.size > 0 || planningMode);

  const commitShifts = useCallback(
    (next: ShiftWithEmployee[]) => {
      if (isControlled) onShiftsChange?.(next);
      else setInternalShifts(next);
    },
    [isControlled, onShiftsChange],
  );

  const weeklyHours = useMemo(() => {
    const totals = new Map<string, number>();
    for (const shift of localShifts) {
      if (!shift.employeeId) continue;
      const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / (1000 * 60 * 60);
      totals.set(shift.employeeId, (totals.get(shift.employeeId) ?? 0) + hours);
    }
    return totals;
  }, [localShifts]);

  function canDragShift(shift: ShiftWithEmployee) {
    return planningMode && shift.status === "DRAFT" && !isPending;
  }

  function applyCnesstFlags(
    list: ShiftWithEmployee[],
    shiftId: string,
    flags: { overtimeFlag: boolean; restViolationFlag: boolean; weeklyHoursSnapshot: number },
  ) {
    return list.map((s) =>
      s.id === shiftId
        ? {
            ...s,
            overtimeFlag: flags.overtimeFlag,
            restViolationFlag: flags.restViolationFlag,
            weeklyHoursSnapshot: flags.weeklyHoursSnapshot,
          }
        : s,
    );
  }

  function handleDrop(employeeId: string, day: Date, shiftId: string) {
    setDragOverKey(null);
    setDraggingId(null);
    setError(null);
    if (!planningMode) return;

    const shift = localShifts.find((s) => s.id === shiftId);
    if (!shift || shift.status !== "DRAFT") {
      setError(dict.schedule.dragErrors.notDraft);
      return;
    }

    const previous = {
      employeeId: shift.employeeId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      employee: shift.employee,
      overtimeFlag: shift.overtimeFlag,
      restViolationFlag: shift.restViolationFlag,
      weeklyHoursSnapshot: shift.weeklyHoursSnapshot,
    };

    const durationMs = shift.endsAt.getTime() - shift.startsAt.getTime();
    const newStart = new Date(day);
    newStart.setHours(shift.startsAt.getHours(), shift.startsAt.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    const newEmployee = roster.find((r) => r.userId === employeeId);

    const optimistic = localShifts.map((s) =>
      s.id === shiftId
        ? {
            ...s,
            employeeId,
            startsAt: newStart,
            endsAt: newEnd,
            employee: newEmployee?.user
              ? { ...newEmployee.user, employeeProfile: newEmployee }
              : s.employee,
          }
        : s,
    );
    commitShifts(optimistic);

    startTransition(async () => {
      const result = await reassignShiftAction({
        shiftId,
        employeeId,
        startsAt: newStart,
        endsAt: newEnd,
      });
      if (!result.ok) {
        setError(resolveDragError(dict, result.error));
        commitShifts(localShifts.map((s) => (s.id === shiftId ? { ...s, ...previous } : s)));
        return;
      }
      commitShifts(
        applyCnesstFlags(optimistic, shiftId, {
          overtimeFlag: result.overtimeFlag,
          restViolationFlag: result.restViolationFlag,
          weeklyHoursSnapshot: result.weeklyHoursSnapshot,
        }),
      );
    });
  }

  function handleUnassign(day: Date, shiftId: string) {
    setDragOverKey(null);
    setDraggingId(null);
    setError(null);
    if (!planningMode) return;

    const shift = localShifts.find((s) => s.id === shiftId);
    if (!shift || shift.status !== "DRAFT") {
      setError(dict.schedule.dragErrors.notDraft);
      return;
    }

    const previous = {
      employeeId: shift.employeeId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      employee: shift.employee,
      overtimeFlag: shift.overtimeFlag,
      restViolationFlag: shift.restViolationFlag,
      weeklyHoursSnapshot: shift.weeklyHoursSnapshot,
    };

    const durationMs = shift.endsAt.getTime() - shift.startsAt.getTime();
    const newStart = new Date(day);
    newStart.setHours(shift.startsAt.getHours(), shift.startsAt.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    const optimistic = localShifts.map((s) =>
      s.id === shiftId
        ? {
            ...s,
            employeeId: null,
            employee: null,
            startsAt: newStart,
            endsAt: newEnd,
          }
        : s,
    );
    commitShifts(optimistic);

    startTransition(async () => {
      const result = await reassignShiftAction({
        shiftId,
        employeeId: null,
        startsAt: newStart,
        endsAt: newEnd,
      });
      if (!result.ok) {
        setError(resolveDragError(dict, result.error));
        commitShifts(localShifts.map((s) => (s.id === shiftId ? { ...s, ...previous } : s)));
        return;
      }
      commitShifts(
        applyCnesstFlags(optimistic, shiftId, {
          overtimeFlag: result.overtimeFlag,
          restViolationFlag: result.restViolationFlag,
          weeklyHoursSnapshot: result.weeklyHoursSnapshot,
        }),
      );
    });
  }

  const handleDeleteDraft = useCallback(
    (shiftId: string) => {
      setError(null);
      const previousShifts = localShifts;
      commitShifts(localShifts.filter((s) => s.id !== shiftId));

      startTransition(async () => {
        const result = await deleteDraftShiftAction(shiftId);
        if (!result.ok) {
          setError(result.error);
          commitShifts(previousShifts);
        }
      });
    },
    [localShifts, commitShifts],
  );

  const handleDragStart = useCallback((shiftId: string) => {
    setDraggingId(shiftId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverKey(null);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {planningMode && (
        <p className="text-xs text-foreground-muted">{dict.schedule.dragHint}</p>
      )}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </div>
      )}
      <div
        className={cn(
          "grid overflow-auto rounded-3xl border border-border bg-surface-muted/60 shadow-xs transition-opacity",
          isPending && "opacity-90",
        )}
        style={{ gridTemplateColumns: `176px repeat(7, minmax(148px, 1fr))` }}
      >
        <div className="sticky left-0 top-0 z-10 border-b border-r border-border bg-surface-glass px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground-muted backdrop-blur-xl">
          {dict.calendar.team}
        </div>
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex items-baseline gap-1.5 border-b border-r border-border px-3 py-2.5",
                isToday && "bg-accent/5",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-[0.12em]",
                  isToday ? "text-foreground" : "text-foreground-muted",
                )}
              >
                {format(day, "EEE", { locale: dateFnsLocales[locale] })}
              </span>
              <span
                className={cn(
                  "metric text-xs font-medium",
                  isToday
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground"
                    : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
          );
        })}

        {hasUnassigned && (
          <div className="contents">
            <div className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 border-b border-r border-border bg-surface-glass px-3 py-2 backdrop-blur-xl">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />
                {dict.calendar.unassigned}
                <span className="metric text-[11px] text-foreground-muted">
                  {[...unassignedByDay.values()].reduce((sum, list) => sum + list.length, 0)}
                </span>
              </span>
              {planningMode && (
                <span className="text-[10px] text-foreground-muted">{dict.schedule.unassignHint}</span>
              )}
            </div>
            {days.map((day) => {
              const dayShifts = unassignedByDay.get(day.toDateString()) ?? [];
              const key = `unassigned::${day.toDateString()}`;
              const isDropTarget = planningMode && dragOverKey === key;
              const isExpanded = expandedUnassigned.has(key);
              const visibleShifts = isExpanded ? dayShifts : dayShifts.slice(0, MAX_UNASSIGNED_VISIBLE);
              const hiddenCount = dayShifts.length - visibleShifts.length;
              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    if (!planningMode) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((prev) => (prev === key ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const shiftId = e.dataTransfer.getData("text/shift-id");
                    if (shiftId) handleUnassign(day, shiftId);
                  }}
                  className={cn(
                    "flex min-h-22 flex-col gap-1.5 border-b border-r border-border bg-surface-muted/40 p-2 transition-colors",
                    isDropTarget && "bg-warning/10 ring-2 ring-inset ring-warning/40",
                  )}
                >
                  {visibleShifts.map((shift) => (
                    <WeekShiftBlock
                      key={shift.id}
                      shift={shift}
                      locale={locale}
                      dict={dict}
                      draggable={canDragShift(shift)}
                      planningMode={planningMode}
                      isDragging={draggingId === shift.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDeleteDraft={handleDeleteDraft}
                      onOpenReplacement={onOpenReplacement}
                      onSicknessSuccess={onSicknessSuccess}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      data-interactive
                      onClick={() => toggleUnassignedDay(key)}
                      className="metric self-start rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                    >
                      +{hiddenCount}
                    </button>
                  )}
                  {isExpanded && dayShifts.length > MAX_UNASSIGNED_VISIBLE && (
                    <button
                      type="button"
                      data-interactive
                      onClick={() => toggleUnassignedDay(key)}
                      className="self-start rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                    >
                      {dict.calendar.showLess}
                    </button>
                  )}
                  {planningMode && dayShifts.length === 0 && isDropTarget && (
                    <p className="px-1 py-3 text-center text-[10px] font-medium text-warning">
                      {dict.schedule.dropZoneHint}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {roster.map((entry) => {
          const hours = weeklyHours.get(entry.userId) ?? 0;
          const maxHours = entry.maxHoursPerWeek ?? 40;
          const ratio = maxHours > 0 ? hours / maxHours : 0;
          const barColor = ratio > 1 ? "bg-danger" : ratio > 0.85 ? "bg-warning" : "bg-accent";

          return (
            <div key={entry.userId} className="contents">
              <div className="sticky left-0 z-10 flex flex-col justify-center gap-1.5 border-b border-r border-border bg-surface-glass px-3 py-2.5 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    fullName={entry.user.fullName}
                    pictureUrl={entry.user.profilePictureUrl}
                    size="sm"
                  />
                  <span className="truncate text-sm font-medium">{entry.user.fullName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-muted">
                    <span
                      className={cn("block h-full rounded-full transition-[width] duration-300", barColor)}
                      style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                    />
                  </span>
                  <span className="metric truncate text-[11px] text-foreground-muted">
                    {hours.toFixed(1)}/{maxHours} h
                  </span>
                </div>
              </div>
              {days.map((day) => {
                const key = dayKey(entry.userId, day);
                const cellShifts = cells.get(key) ?? [];
                const isToday = isSameDay(day, today);
                const isDropTarget = planningMode && dragOverKey === key;

                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      if (!planningMode) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverKey(key);
                    }}
                    onDragLeave={() => setDragOverKey((prev) => (prev === key ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const shiftId = e.dataTransfer.getData("text/shift-id");
                      if (shiftId) handleDrop(entry.userId, day, shiftId);
                    }}
                    className={cn(
                      "flex min-h-22 flex-col gap-1.5 border-b border-r border-border p-2 transition-colors",
                      isToday && "bg-accent/5",
                      isDropTarget && "bg-accent/5 ring-2 ring-inset ring-accent/20",
                    )}
                  >
                    {cellShifts.map((shift) => (
                      <WeekShiftBlock
                        key={shift.id}
                        shift={shift}
                        locale={locale}
                        dict={dict}
                        draggable={canDragShift(shift)}
                        planningMode={planningMode}
                        isDragging={draggingId === shift.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDeleteDraft={handleDeleteDraft}
                        onOpenReplacement={onOpenReplacement}
                        onSicknessSuccess={onSicknessSuccess}
                      />
                    ))}
                    {planningMode && cellShifts.length === 0 && isDropTarget && (
                      <p className="px-1 py-3 text-center text-[10px] font-medium text-accent">
                        {dict.schedule.dropZoneHint}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WeekShiftBlock = memo(function WeekShiftBlock({
  shift,
  locale,
  dict,
  draggable,
  planningMode,
  isDragging,
  onDragStart,
  onDragEnd,
  onDeleteDraft,
  onOpenReplacement,
  onSicknessSuccess,
}: {
  shift: ShiftWithEmployee;
  locale: Locale;
  dict: Dictionary;
  draggable: boolean;
  planningMode: boolean;
  isDragging: boolean;
  onDragStart: (shiftId: string) => void;
  onDragEnd: () => void;
  onDeleteDraft: (shiftId: string) => void;
  onOpenReplacement?: (shift: ShiftWithEmployee) => void;
  onSicknessSuccess?: (result: SicknessFlowResult, shift: ShiftWithEmployee) => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/shift-id", shift.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(shift.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col gap-1 transition-transform duration-150",
        draggable && "cursor-grab active:cursor-grabbing",
        !draggable && planningMode && "cursor-default",
        isDragging && "scale-[1.02] opacity-80 shadow-lg",
      )}
    >
      <ShiftChip
        shift={shift}
        locale={locale}
        dict={dict}
        draggableHint={draggable}
        onDelete={shift.status === "DRAFT" ? () => onDeleteDraft(shift.id) : undefined}
      />
      {onOpenReplacement && (
        <ReplacementFinderTrigger shift={shift} dict={dict} onOpen={onOpenReplacement} fullWidth />
      )}
      {onSicknessSuccess && (
        <ReportSicknessTrigger
          shift={shift}
          dict={dict}
          lang={locale}
          onSuccess={onSicknessSuccess}
          fullWidth
        />
      )}
    </div>
  );
});
