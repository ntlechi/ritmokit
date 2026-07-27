import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { calculateLiveLaborKpis, type LiveLaborKpiReport } from "@/lib/finance/labor-kpis";
import { getConventionLocationStats } from "@/lib/data/workplace-convention";
import { computeLocationKpiSnapshot } from "@/lib/kpi/compute";
import type { LocationKpiSnapshot } from "@/lib/kpi/types";
import { getPulseWeekParts } from "@/lib/pulse/week";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";

export type FloorStationCount = {
  stationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  count: number;
};

export type ActiveCodeRedCrisis = {
  shiftId: string;
  stationNameFr: string;
  stationNameEn: string;
  stationNameEs: string;
  startsAt: string;
  hoursUntilStart: number;
  notifiedCount: number;
  surgeBonus: number | null;
};

export type ManagerOpsDashboard = {
  locationName: string;
  labor: LiveLaborKpiReport | null;
  weekLaborDeltaPts: number | null;
  onFloorTotal: number;
  onFloorByStation: FloorStationCount[];
  compliancePercent: number;
  complianceCertifiedShifts: number;
  complianceActiveShifts: number;
  cultureScore: number | null;
  shoutOutsToday: number;
  pulseResponseCount: number;
  conventionSignedPercent: number;
  conventionSignedCount: number;
  conventionTotalEmployees: number;
  conventionPendingCount: number;
  conventionVersion: string;
  crises: ActiveCodeRedCrisis[];
  kpiSnapshot: LocationKpiSnapshot;
  generatedAt: string;
};

function stationName(row: FloorStationCount, lang: Locale) {
  if (lang === "en") return row.nameEn;
  if (lang === "es") return row.nameEs;
  return row.nameFr;
}

export { stationName };

/** Lightweight pulse average for the cockpit — never runs Autopilot sync. */
async function getPulseSummary(locationId: string) {
  const { weekNumber, year } = getPulseWeekParts();
  const agg = await prisma.pulseResponse.aggregate({
    where: { locationId, year, weekNumber },
    _avg: { score: true },
    _count: { _all: true },
  });
  const count = agg._count._all ?? 0;
  const pulseOverall =
    count === 0 || agg._avg.score == null ? null : Math.round(agg._avg.score * 10) / 10;
  return { pulseOverall, pulseResponseCount: count };
}

export async function getManagerOpsDashboard(
  userId: string,
  role: string,
  _lang: Locale,
): Promise<ManagerOpsDashboard | null> {
  if (!canAccessManagerSettings(role as Parameters<typeof canAccessManagerSettings>[0])) {
    return null;
  }

  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const locationId = membership.locationId;
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Labor first — KPI snapshot reuses it (avoids a third full labor pass).
  const [labor, laborLastWeek] = await Promise.all([
    calculateLiveLaborKpis({ locationId, targetDate: now }).catch(() => null),
    calculateLiveLaborKpis({
      locationId,
      targetDate: weekAgo,
      skipOvertimeRisk: true,
    }).catch(() => null),
  ]);

  const [
    pulse,
    onFloorShifts,
    activeShifts,
    formationModules,
    formationProgress,
    crises,
    shoutOutsToday,
    conventionStats,
    kpiSnapshot,
  ] = await Promise.all([
    getPulseSummary(locationId),
    prisma.shift.findMany({
      where: {
        locationId,
        employeeId: { not: null },
        OR: [
          { actualStartsAt: { not: null }, actualEndsAt: null },
          {
            startsAt: { lte: now },
            endsAt: { gt: now },
            status: { in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] },
          },
        ],
      },
      include: {
        station: true,
        employee: { select: { id: true, fullName: true } },
      },
    }),
    prisma.shift.findMany({
      where: {
        locationId,
        startsAt: { lte: now },
        endsAt: { gt: now },
        status: { in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] },
        employeeId: { not: null },
      },
      select: { id: true, employeeId: true },
    }),
    prisma.formationModule.findMany({
      where: {
        isActive: true,
        isMandatory: true,
        OR: [
          { locationId },
          { organizationId: membership.location.organizationId, locationId: null },
        ],
      },
      select: { id: true },
    }),
    prisma.employeeFormationProgress.findMany({
      where: {
        status: "COMPLETED",
        module: {
          isActive: true,
          isMandatory: true,
          OR: [
            { locationId },
            { organizationId: membership.location.organizationId, locationId: null },
          ],
        },
      },
      select: { userId: true, moduleId: true },
    }),
    prisma.shift.findMany({
      where: {
        locationId,
        urgency: "CODE_RED",
        employeeId: null,
        startsAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
      include: {
        station: true,
        emergencyBids: { where: { status: "PENDING" }, select: { id: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    prisma.stationShoutOut.count({
      where: {
        locationId,
        createdAt: { gte: todayStart },
      },
    }),
    getConventionLocationStats(locationId),
    computeLocationKpiSnapshot(locationId, now, labor),
  ]);

  const stationMap = new Map<string, FloorStationCount>();
  for (const shift of onFloorShifts) {
    const key = shift.stationId;
    const existing = stationMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      stationMap.set(key, {
        stationId: shift.station.id,
        nameFr: shift.station.nameFr,
        nameEn: shift.station.nameEn,
        nameEs: shift.station.nameEs,
        colorHex: shift.station.colorHex,
        count: 1,
      });
    }
  }
  const onFloorByStation = [...stationMap.values()].sort((a, b) => b.count - a.count);

  const mandatoryIds = new Set(formationModules.map((m) => m.id));
  const completedByUser = new Map<string, Set<string>>();
  for (const row of formationProgress) {
    if (!mandatoryIds.has(row.moduleId)) continue;
    const set = completedByUser.get(row.userId) ?? new Set();
    set.add(row.moduleId);
    completedByUser.set(row.userId, set);
  }

  const activeEmployeeIds = [
    ...new Set(activeShifts.map((s) => s.employeeId).filter(Boolean) as string[]),
  ];
  let certified = 0;
  for (const empId of activeEmployeeIds) {
    const done = completedByUser.get(empId)?.size ?? 0;
    if (mandatoryIds.size === 0 || done >= mandatoryIds.size) certified += 1;
  }
  const complianceActiveShifts = activeEmployeeIds.length;
  const compliancePercent =
    complianceActiveShifts === 0
      ? 100
      : Math.round((certified / complianceActiveShifts) * 1000) / 10;

  let weekLaborDeltaPts: number | null = null;
  if (labor && laborLastWeek) {
    weekLaborDeltaPts =
      Math.round((labor.liveLaborCostPercentage - laborLastWeek.liveLaborCostPercentage) * 10) / 10;
  }

  return {
    locationName: membership.location.name,
    labor,
    weekLaborDeltaPts,
    onFloorTotal: onFloorShifts.length,
    onFloorByStation,
    compliancePercent,
    complianceCertifiedShifts: certified,
    complianceActiveShifts,
    cultureScore: pulse.pulseOverall,
    shoutOutsToday,
    pulseResponseCount: pulse.pulseResponseCount,
    conventionSignedPercent: conventionStats.signedPercent,
    conventionSignedCount: conventionStats.signedCount,
    conventionTotalEmployees: conventionStats.totalEmployees,
    conventionPendingCount: conventionStats.pendingCount,
    conventionVersion: conventionStats.version,
    crises: crises.map((shift) => ({
      shiftId: shift.id,
      stationNameFr: shift.station.nameFr,
      stationNameEn: shift.station.nameEn,
      stationNameEs: shift.station.nameEs,
      startsAt: shift.startsAt.toISOString(),
      hoursUntilStart: Math.max(0, (shift.startsAt.getTime() - now.getTime()) / 3_600_000),
      notifiedCount: shift.emergencyBids.length,
      surgeBonus: shift.surgeBonus != null ? asPlainNumber(shift.surgeBonus) : null,
    })),
    kpiSnapshot,
    generatedAt: now.toISOString(),
  };
}
