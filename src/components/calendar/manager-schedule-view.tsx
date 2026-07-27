"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { SlidersHorizontal } from "lucide-react";
import { deleteDraftShiftAction } from "@/lib/actions/auto-schedule";
import { reassignShiftAction } from "@/lib/actions/shifts";
import { AutoScheduleControls } from "@/components/calendar/auto-schedule-controls";
import { CoverageHeatmap } from "@/components/calendar/coverage-heatmap";
import { OrphanShiftsDrawer } from "@/components/calendar/orphan-shifts-drawer";
import { CrisisShiftsBanner } from "@/components/calendar/crisis-shifts-banner";
import { ReplacementFinderSheet, type ReplacementScanState } from "@/components/calendar/replacement-finder-sheet";
import { TodayStaffedShiftsBar } from "@/components/calendar/today-staffed-shifts-bar";
import type { SicknessFlowResult } from "@/components/calendar/report-sickness-trigger";
import { StaffingTargetsSidebar } from "@/components/calendar/staffing-targets-sidebar";
import { WeekTemplatesPanel } from "@/components/calendar/week-templates-panel";
import { WeekView } from "@/components/calendar/week-view";
import type { EmployeeRosterEntry } from "@/lib/data/employees";
import type { ManagerScheduleDayPayload } from "@/lib/data/manager-schedule";
import type { ScheduleTemplateSummary } from "@/lib/data/schedule-templates";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import { isSameDay } from "@/lib/calendar/grid";
import {
  buildHourlyCoverage,
  computeScheduledHeadcountFromShifts,
} from "@/lib/scheduling/coverage-client";
import type { StaffingProfileSnapshot } from "@/lib/scheduling/staffing-curve-core";
import type { StationRecord } from "@/lib/stations/display";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

export function ManagerScheduleView({
  days,
  weekStartIso,
  roster,
  shifts: initialShifts,
  scheduleDays,
  stations,
  profiles: initialProfiles,
  templates,
  locale,
  dict,
}: {
  days: Date[];
  weekStartIso: string;
  roster: EmployeeRosterEntry[];
  shifts: ShiftWithEmployee[];
  scheduleDays: ManagerScheduleDayPayload[];
  stations: StationRecord[];
  profiles: Record<string, StaffingProfileSnapshot>;
  templates: ScheduleTemplateSummary[];
  locale: Locale;
  dict: Dictionary;
}) {
  const [shifts, setShifts] = useState(initialShifts);
  const [, startDelete] = useTransition();
  const [, startUnassign] = useTransition();
  const [dragError, setDragError] = useState<string | null>(null);

  useEffect(() => {
    setShifts(initialShifts);
  }, [initialShifts]);

  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const todayIdx = days.findIndex((d) => isSameDay(d, new Date()));
    return todayIdx >= 0 ? todayIdx : 0;
  });
  const [previewProfiles, setPreviewProfiles] = useState(initialProfiles);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [replacementShift, setReplacementShift] = useState<ShiftWithEmployee | null>(null);
  const [replacementInitialScan, setReplacementInitialScan] = useState<ReplacementScanState | null>(null);

  function handleOpenReplacement(shift: ShiftWithEmployee, scan?: ReplacementScanState) {
    setReplacementShift(shift);
    setReplacementInitialScan(scan ?? null);
  }

  function handleSicknessSuccess(result: SicknessFlowResult, crisisShift: ShiftWithEmployee) {
    setShifts((prev) => prev.map((s) => (s.id === crisisShift.id ? crisisShift : s)));
    handleOpenReplacement(crisisShift, {
      candidates: result.candidates,
      rejections: result.rejections,
      scanned: result.scanned,
    });
  }

  useEffect(() => {
    setPreviewProfiles(initialProfiles);
  }, [initialProfiles]);

  const selectedDay = days[selectedDayIndex];
  const dayPayload = scheduleDays[selectedDayIndex];

  const dayBounds = useMemo(() => {
    const start = new Date(selectedDay);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }, [selectedDay]);

  const stationIds = useMemo(() => stations.map((s) => s.id), [stations]);

  const hourlyCoverage = useMemo(() => {
    if (!dayPayload) return [];
    const dayShifts = shifts.filter(
      (s) => s.startsAt >= dayBounds.start && s.startsAt < dayBounds.end,
    );
    const scheduledByStation = computeScheduledHeadcountFromShifts(
      dayShifts.map((s) => ({
        stationId: s.station.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        employeeId: s.employeeId,
      })),
      stationIds,
      dayBounds.start,
      dayBounds.end,
    );
    return buildHourlyCoverage({
      salesByHour: dayPayload.salesByHour,
      stationIds,
      profiles: previewProfiles,
      scheduledByStation,
    });
  }, [dayPayload, dayBounds, shifts, previewProfiles, stationIds]);

  const dayShiftsForBanner = useMemo(
    () => shifts.filter((s) => s.startsAt >= dayBounds.start && s.startsAt < dayBounds.end),
    [shifts, dayBounds],
  );

  const orphanShifts = useMemo(
    () => shifts.filter((s) => !s.employeeId && s.status === "DRAFT").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [shifts],
  );

  const handlePreviewChange = useCallback((profiles: Record<string, StaffingProfileSnapshot>) => {
    setPreviewProfiles(profiles);
  }, []);

  function handleDeleteOrphan(shiftId: string) {
    const previous = shifts;
    setShifts((prev) => prev.filter((s) => s.id !== shiftId));
    startDelete(async () => {
      const result = await deleteDraftShiftAction(shiftId);
      if (!result.ok) setShifts(previous);
    });
  }

  function handleUnassignToOrphan(shiftId: string) {
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift || shift.status !== "DRAFT") return;
    if (!shift.employeeId) return;

    setDragError(null);
    const previous = shifts;
    const optimistic = shifts.map((s) =>
      s.id === shiftId ? { ...s, employeeId: null, employee: null } : s,
    );
    setShifts(optimistic);

    startUnassign(async () => {
      const result = await reassignShiftAction({
        shiftId,
        employeeId: null,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      });
      if (!result.ok) {
        setShifts(previous);
        const map = dict.schedule.dragErrors;
        const code = result.error;
        setDragError(
          code === "unauthorized"
            ? map.unauthorized
            : code === "not_draft"
              ? map.notDraft
              : code === "shift_not_found"
                ? map.shiftNotFound
                : code === "shift_conflict"
                  ? map.shiftConflict
                  : code.startsWith("CNESST:")
                    ? code
                    : map.databaseError,
        );
        return;
      }
      setShifts((prev) =>
        prev.map((s) =>
          s.id === shiftId
            ? {
                ...s,
                overtimeFlag: result.overtimeFlag,
                restViolationFlag: result.restViolationFlag,
                weeklyHoursSnapshot: result.weeklyHoursSnapshot,
              }
            : s,
        ),
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {days.map((day, index) => (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelectedDayIndex(index)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                index === selectedDayIndex
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "bg-zinc-100 text-foreground-muted hover:text-foreground dark:bg-white/5",
              )}
            >
              {format(day, "EEE d", { locale: dateFnsLocales[locale] })}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {dict.schedule.openTargets}
        </button>
      </div>

      <AutoScheduleControls weekStartIso={weekStartIso} dict={dict} />

      <WeekTemplatesPanel weekStartIso={weekStartIso} templates={templates} dict={dict} />

      {dragError && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
          {dragError}
        </div>
      )}

      <TodayStaffedShiftsBar
        shifts={shifts}
        dict={dict}
        locale={locale}
        onSicknessSuccess={handleSicknessSuccess}
      />

      <CrisisShiftsBanner
        shifts={dayShiftsForBanner}
        dict={dict}
        locale={locale}
        onOpenReplacement={handleOpenReplacement}
      />

      {dayPayload && (
        <CoverageHeatmap
          hourly={hourlyCoverage}
          laborBuckets={dayPayload.laborBuckets}
          stations={stations}
          locale={locale}
          dict={dict}
        />
      )}

      <OrphanShiftsDrawer
        days={days}
        shifts={orphanShifts}
        locale={locale}
        dict={dict}
        onDelete={handleDeleteOrphan}
        onOpenReplacement={handleOpenReplacement}
        onUnassignDrop={handleUnassignToOrphan}
      />

      <WeekView
        days={days}
        roster={roster}
        shifts={shifts}
        locale={locale}
        dict={dict}
        planningMode
        unassignedInRow={false}
        onShiftsChange={setShifts}
        onOpenReplacement={handleOpenReplacement}
        onSicknessSuccess={handleSicknessSuccess}
      />

      <StaffingTargetsSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        stations={stations}
        initialProfiles={previewProfiles}
        dict={dict}
        locale={locale}
        onPreviewChange={handlePreviewChange}
      />

      <ReplacementFinderSheet
        shift={replacementShift}
        open={replacementShift != null}
        onClose={() => {
          setReplacementShift(null);
          setReplacementInitialScan(null);
        }}
        lang={locale}
        dict={dict}
        onAssigned={() => {
          setReplacementShift(null);
          setReplacementInitialScan(null);
        }}
        initialScan={replacementInitialScan}
      />
    </div>
  );
}
