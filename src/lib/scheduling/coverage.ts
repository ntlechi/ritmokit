import "server-only";

import type { ShiftStatus } from "@/generated/prisma/enums";
import {
  calculateLiveLaborKpis,
  getDayBoundsFromLocalDate,
  getHourInToronto,
  getNextHourBoundaryInToronto,
  LABOR_COST_CRITICAL_THRESHOLD,
  LABOR_COST_TARGET_MAX,
  type HourlyLaborBucket,
} from "@/lib/finance/labor-kpis";
import { prisma } from "@/lib/prisma";
import {
  computeRequiredHeadcountCurve,
  getStaffingProfilesForLocation,
  type StaffingProfileSnapshot,
} from "@/lib/scheduling/staffing-curve";

/** Statuts de quart considérés "engagés" pour le calcul d'effectif planifié. */
const COVERAGE_SHIFT_STATUSES: ShiftStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
];

/** Weighted students/hour target — alert when revenue per labor hour falls below this ratio. */
const REVENUE_PER_HOUR_ALERT_RATIO = 0.7;

export type StationHourCoverage = {
  stationId: string;
  hour: number;
  requiredHeadcount: number;
  scheduledHeadcount: number;
  gap: number;
  status: "understaffed" | "overstaffed" | "ok";
};

export type CoverageAlertKind = "understaffed" | "overstaffed" | "labor_cost_critical" | "revenue_per_hour_low";

export type CoverageAlert = {
  kind: CoverageAlertKind;
  stationId: string | null;
  startHour: number;
  /** Exclusif — la plage couvre [startHour, endHour). */
  endHour: number;
};

export type CoverageScoreReport = {
  locationId: string;
  targetDate: string;
  stationIds: string[];
  hourly: StationHourCoverage[];
  alerts: CoverageAlert[];
  laborBuckets: HourlyLaborBucket[];
  targetCompositeStudentsPerHour: number;
  profiles: Record<string, StaffingProfileSnapshot>;
};

export async function calculateCoverageScore(input: {
  locationId: string;
  targetDate: Date;
}): Promise<CoverageScoreReport> {
  const { locationId, targetDate } = input;
  const { dayStart, dayEnd } = getDayBoundsFromLocalDate(targetDate);

  const [laborKpis, { stations, profiles }, shifts] = await Promise.all([
    calculateLiveLaborKpis({ locationId, targetDate, skipOvertimeRisk: true }),
    getStaffingProfilesForLocation(locationId),
    prisma.shift.findMany({
      where: {
        locationId,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        status: { in: COVERAGE_SHIFT_STATUSES },
        employeeId: { not: null },
      },
      select: { stationId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const stationIds = stations.map((s) => s.id);
  const classRevenueByHour = laborKpis.buckets.map((bucket) => bucket.actualClassRevenue ?? bucket.projectedClassRevenue);
  const requiredByStation = computeRequiredHeadcountCurve(classRevenueByHour, stationIds, profiles);
  const scheduledByStation = computeScheduledHeadcountCurve(shifts, stationIds, dayStart, dayEnd);

  const hourly: StationHourCoverage[] = [];
  for (const stationId of stationIds) {
    for (let hour = 0; hour < 24; hour += 1) {
      const requiredHeadcount = requiredByStation[stationId]?.[hour] ?? 0;
      const scheduledHeadcount = scheduledByStation[stationId]?.[hour] ?? 0;
      const gap = scheduledHeadcount - requiredHeadcount;
      hourly.push({
        stationId,
        hour,
        requiredHeadcount,
        scheduledHeadcount,
        gap,
        status: gap < 0 ? "understaffed" : gap > 0 ? "overstaffed" : "ok",
      });
    }
  }

  const targetCompositeStudentsPerHour = computeCompositeTargetStudentsPerHour(stationIds, profiles);
  const alerts = buildCoverageAlerts(hourly, stationIds, laborKpis.buckets, targetCompositeStudentsPerHour);

  return {
    locationId,
    targetDate: dayStart.toISOString(),
    stationIds,
    hourly,
    alerts,
    laborBuckets: laborKpis.buckets,
    targetCompositeStudentsPerHour,
    profiles,
  };
}

function computeScheduledHeadcountCurve(
  shifts: Array<{ stationId: string; startsAt: Date; endsAt: Date }>,
  stationIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const stationId of stationIds) {
    result[stationId] = new Array(24).fill(0);
  }

  for (const shift of shifts) {
    const start = shift.startsAt < dayStart ? dayStart : shift.startsAt;
    const end = shift.endsAt > dayEnd ? dayEnd : shift.endsAt;

    let cursor = new Date(start);
    while (cursor < end) {
      const hour = getHourInToronto(cursor);
      if (result[shift.stationId]) {
        result[shift.stationId][hour] += 1;
      }
      cursor = getNextHourBoundaryInToronto(cursor);
    }
  }

  return result;
}

function computeCompositeTargetStudentsPerHour(
  stationIds: string[],
  profiles: Record<string, StaffingProfileSnapshot>,
): number {
  const totalShare = stationIds.reduce((sum, id) => sum + (profiles[id]?.classMixSharePercent ?? 0), 0);
  if (totalShare <= 0) return 0;
  const weighted = stationIds.reduce(
    (sum, id) =>
      sum + (profiles[id]?.studentsPerHour ?? 0) * (profiles[id]?.classMixSharePercent ?? 0),
    0,
  );
  return weighted / totalShare;
}

function buildCoverageAlerts(
  hourly: StationHourCoverage[],
  stationIds: string[],
  laborBuckets: HourlyLaborBucket[],
  targetCompositeStudentsPerHour: number,
): CoverageAlert[] {
  const alerts: CoverageAlert[] = [];

  for (const stationId of stationIds) {
    const rows = hourly
      .filter((row) => row.stationId === stationId)
      .sort((a, b) => a.hour - b.hour);

    alerts.push(...groupContiguous(rows, "understaffed", stationId));
    alerts.push(...groupContiguous(rows, "overstaffed", stationId));
  }

  const financialRows = laborBuckets.map((bucket) => {
    const classRevenue = bucket.actualClassRevenue ?? bucket.projectedClassRevenue;
    const revenuePerHour = bucket.laborHours > 0 ? classRevenue / bucket.laborHours : null;
    const laborCostPct = classRevenue > 0 ? (bucket.laborCost / classRevenue) * 100 : 0;
    return {
      hour: bucket.hour,
      isCritical: classRevenue > 0 && laborCostPct >= LABOR_COST_CRITICAL_THRESHOLD,
      isWarning: classRevenue > 0 && laborCostPct > LABOR_COST_TARGET_MAX,
      isRevenuePerHourLow:
        classRevenue > 0 &&
        revenuePerHour !== null &&
        targetCompositeStudentsPerHour > 0 &&
        revenuePerHour < targetCompositeStudentsPerHour * REVENUE_PER_HOUR_ALERT_RATIO,
    };
  });

  alerts.push(
    ...groupContiguousGeneric(
      financialRows,
      (row) => row.isCritical,
      () => ({ kind: "labor_cost_critical" as const, stationId: null }),
    ),
  );
  alerts.push(
    ...groupContiguousGeneric(
      financialRows,
      (row) => row.isRevenuePerHourLow,
      () => ({ kind: "revenue_per_hour_low" as const, stationId: null }),
    ),
  );

  return alerts.sort((a, b) => a.startHour - b.startHour);
}

function groupContiguous(
  rows: StationHourCoverage[],
  status: "understaffed" | "overstaffed",
  stationId: string,
): CoverageAlert[] {
  return groupContiguousGeneric(
    rows,
    (row) => row.status === status,
    () => ({ kind: status, stationId }),
  );
}

function groupContiguousGeneric<T extends { hour: number }>(
  rows: T[],
  predicate: (row: T) => boolean,
  toAlert: (row: T) => { kind: CoverageAlertKind; stationId: string | null },
): CoverageAlert[] {
  const alerts: CoverageAlert[] = [];
  let blockStart: number | null = null;
  let blockMeta: { kind: CoverageAlertKind; stationId: string | null } | null = null;

  for (let i = 0; i <= rows.length; i += 1) {
    const row = rows[i];
    const matches = row ? predicate(row) : false;

    if (matches && blockStart === null) {
      blockStart = row.hour;
      blockMeta = toAlert(row);
    } else if (!matches && blockStart !== null) {
      const previousHour = rows[i - 1]?.hour ?? blockStart;
      alerts.push({ ...blockMeta!, startHour: blockStart, endHour: previousHour + 1 });
      blockStart = null;
      blockMeta = null;
    }
  }

  return alerts;
}
