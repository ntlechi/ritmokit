import { LABOR_COST_CRITICAL_THRESHOLD, LABOR_COST_TARGET_MAX } from "@/lib/finance/labor-kpis-constants";
import {
  computeRequiredHeadcountCurve,
  type StaffingProfileSnapshot,
} from "@/lib/scheduling/staffing-curve-core";
import type { StationRecord } from "@/lib/stations/display";

export type StationHourCoverage = {
  stationId: string;
  hour: number;
  requiredHeadcount: number;
  scheduledHeadcount: number;
  gap: number;
  status: "understaffed" | "overstaffed" | "ok" | "closed";
};

export type HourFinancialSnapshot = {
  hour: number;
  sales: number;
  laborHours: number;
  laborCost: number;
  laborCostPct: number;
  splh: number | null;
  isCritical: boolean;
  isWarning: boolean;
};

export type HeatmapCellTone = "closed" | "understaffed" | "overstaffed" | "ok" | "critical";

/** Heures d'ouverture affichées dans la heatmap (6h–23h). */
export const HEATMAP_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

export function computeScheduledHeadcountFromShifts(
  shifts: Array<{ stationId: string; startsAt: Date; endsAt: Date; employeeId: string | null }>,
  stationIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const stationId of stationIds) {
    result[stationId] = new Array(24).fill(0);
  }

  for (const shift of shifts) {
    if (!shift.employeeId) continue;
    const start = shift.startsAt < dayStart ? dayStart : shift.startsAt;
    const end = shift.endsAt > dayEnd ? dayEnd : shift.endsAt;
    if (start >= end) continue;

    let cursor = new Date(start);
    while (cursor < end) {
      const hour = cursor.getHours();
      if (result[shift.stationId]) {
        result[shift.stationId][hour] += 1;
      }
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
    }
  }

  return result;
}

export function buildHourlyCoverage(input: {
  salesByHour: number[];
  stationIds: string[];
  profiles: Record<string, StaffingProfileSnapshot>;
  scheduledByStation: Record<string, number[]>;
}): StationHourCoverage[] {
  const requiredByStation = computeRequiredHeadcountCurve(
    input.salesByHour,
    input.stationIds,
    input.profiles,
  );
  const hourly: StationHourCoverage[] = [];

  for (const stationId of input.stationIds) {
    for (let hour = 0; hour < 24; hour += 1) {
      const sales = input.salesByHour[hour] ?? 0;
      const requiredHeadcount = requiredByStation[stationId]?.[hour] ?? 0;
      const scheduledHeadcount = input.scheduledByStation[stationId]?.[hour] ?? 0;
      const gap = scheduledHeadcount - requiredHeadcount;
      let status: StationHourCoverage["status"] = "closed";
      if (sales > 0) {
        status = gap < 0 ? "understaffed" : gap > 0 ? "overstaffed" : "ok";
      }
      hourly.push({ stationId, hour, requiredHeadcount, scheduledHeadcount, gap, status });
    }
  }

  return hourly;
}

export function buildFinancialSnapshots(
  buckets: Array<{
    hour: number;
    projectedSales: number;
    actualSales: number | null;
    laborHours: number;
    laborCost: number;
  }>,
): HourFinancialSnapshot[] {
  return buckets.map((bucket) => {
    const sales = bucket.actualSales ?? bucket.projectedSales;
    const splh = bucket.laborHours > 0 ? sales / bucket.laborHours : null;
    const laborCostPct = sales > 0 ? (bucket.laborCost / sales) * 100 : 0;
    return {
      hour: bucket.hour,
      sales,
      laborHours: bucket.laborHours,
      laborCost: bucket.laborCost,
      laborCostPct,
      splh,
      isCritical: sales > 0 && laborCostPct >= LABOR_COST_CRITICAL_THRESHOLD,
      isWarning: sales > 0 && laborCostPct > LABOR_COST_TARGET_MAX,
    };
  });
}

export function resolveHeatmapTone(
  coverage: StationHourCoverage,
  financial: HourFinancialSnapshot | undefined,
): HeatmapCellTone {
  if (coverage.status === "closed") return "closed";
  if (financial?.isCritical && coverage.status === "overstaffed") return "critical";
  if (financial?.isCritical) return "critical";
  return coverage.status;
}

export function stationsByIdMap(stations: StationRecord[]): Map<string, StationRecord> {
  return new Map(stations.map((s) => [s.id, s]));
}
