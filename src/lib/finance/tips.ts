import "server-only";

import type { VoteStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import { getTorontoDayBounds } from "@/lib/time/cnesst-week";
import { DEFAULT_LOCATION_TIMEZONE } from "@/lib/time/location-timezone";

export { getTorontoDayBounds };

const TORONTO_TZ = DEFAULT_LOCATION_TIMEZONE;

export type TipPoolConfigSnapshot = {
  id: string;
  isActive: boolean;
  status: VoteStatus;
  agreementText: string | null;
  votedAt: string | null;
};

export type StationTipPoints = {
  id: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  tipPoints: number;
};

export type TipDistributionResult =
  | {
      ok: true;
      distributedToCount: number;
      totalTipsCollected: number;
      valuePerPoint: number;
      distributionId: string;
    }
  | { ok: false; error: string };

type TipPoolConfigRow = {
  id: string;
  isActive: boolean;
  status: VoteStatus;
  agreementText: string | null;
  votedAt: Date | null;
};

type PunchShiftRow = {
  id: string;
  stationId: string;
  station: { tipPoints: { toString(): string } };
  actualStartsAt: Date | null;
  actualEndsAt: Date | null;
  breakStartedAt: Date | null;
  breakEndedAt: Date | null;
  breakMinutes: number;
};

export function serializeTipPoolConfig(config: TipPoolConfigRow): TipPoolConfigSnapshot {
  return {
    id: config.id,
    isActive: config.isActive,
    status: config.status,
    agreementText: config.agreementText,
    votedAt: config.votedAt?.toISOString() ?? null,
  };
}

export function getStationTipPoints(shift: PunchShiftRow): number {
  return asPlainNumber(shift.station.tipPoints);
}

/** Heures nettes travaillées selon les pointages réels (pause déduite). */
export function calculatePunchedWorkedHours(shift: PunchShiftRow): number {
  if (!shift.actualStartsAt || !shift.actualEndsAt) return 0;

  const breakMinutes =
    shift.breakStartedAt && shift.breakEndedAt
      ? Math.round((shift.breakEndedAt.getTime() - shift.breakStartedAt.getTime()) / (60 * 1000))
      : shift.breakMinutes;

  const grossHours =
    (shift.actualEndsAt.getTime() - shift.actualStartsAt.getTime()) / (1000 * 60 * 60);
  return Math.max(grossHours - breakMinutes / 60, 0);
}

export function calculateWeightedScore(shift: PunchShiftRow): number {
  const hours = calculatePunchedWorkedHours(shift);
  const points = getStationTipPoints(shift);
  return hours * points;
}

/** Parse une saisie `YYYY-MM-DD` du gérant en date d'affaires Toronto. */
export function parseBusinessDateInput(dateValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
}

function getTorontoOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export async function distributeLocationTips(input: {
  locationId: string;
  date: Date;
  totalTipsCollected: number;
  distributedById: string;
}): Promise<TipDistributionResult> {
  const { locationId, date, totalTipsCollected, distributedById } = input;

  if (totalTipsCollected <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  const configRow = await prisma.tipPoolConfig.findUnique({ where: { locationId } });
  if (!configRow || !configRow.isActive || configRow.status !== "APPROVED") {
    return { ok: false, error: "no_active_tip_agreement" };
  }

  const { dayStart, dayEnd, distributionDate } = getTorontoDayBounds(date);

  const existing = await prisma.tipDistribution.findUnique({
    where: { locationId_distributionDate: { locationId, distributionDate } },
  });
  if (existing) {
    return { ok: false, error: "already_distributed" };
  }

  const completedShifts = await prisma.shift.findMany({
    where: {
      locationId,
      employeeId: { not: null },
      actualStartsAt: { not: null },
      actualEndsAt: { gte: dayStart, lt: dayEnd },
      tipEarned: null,
    },
    include: { station: true },
  });

  if (completedShifts.length === 0) {
    return { ok: false, error: "no_completed_shifts" };
  }

  const metrics = completedShifts.map((shift) => {
    const workedHours = calculatePunchedWorkedHours(shift);
    const stationPoints = getStationTipPoints(shift);
    const weightedScore = workedHours * stationPoints;
    return { shiftId: shift.id, workedHours, stationPoints, weightedScore };
  });

  const totalWeightedHours = metrics.reduce((sum, m) => sum + m.weightedScore, 0);
  if (totalWeightedHours <= 0) {
    return { ok: false, error: "zero_hours_calculated" };
  }

  const valuePerPoint = totalTipsCollected / totalWeightedHours;

  const distribution = await prisma.$transaction(async (tx) => {
    const created = await tx.tipDistribution.create({
      data: {
        locationId,
        distributionDate,
        totalTipsCollected,
        totalWeightedHours,
        valuePerPoint,
        distributedById,
      },
    });

    await tx.shiftTipEarned.createMany({
      data: metrics.map((metric) => ({
        shiftId: metric.shiftId,
        distributionId: created.id,
        amountPaid: round2(metric.weightedScore * valuePerPoint),
        weightedScore: round4(metric.weightedScore),
        workedHours: round2(metric.workedHours),
        stationPoints: metric.stationPoints,
      })),
    });

    return created;
  });

  return {
    ok: true,
    distributedToCount: metrics.length,
    totalTipsCollected,
    valuePerPoint: round4(valuePerPoint),
    distributionId: distribution.id,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
