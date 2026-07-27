import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const PENDING_WINDOW_MS = 36 * 60 * 60 * 1000;
const TREND_WINDOW_DAYS = 30;

export type PendingFeedbackItem = {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  stationId: string;
  stationNameFr: string;
  startsAt: string;
  endsAt: string;
  actualEndsAt: string;
};

export type FeedbackTrendPoint = {
  date: string;
  attitude: number;
  speed: number;
  reliability: number;
  average: number;
};

export type EmployeeFeedbackTrend = {
  employeeId: string;
  count: number;
  averages: {
    attitude: number;
    speed: number;
    reliability: number;
    overall: number;
  };
  points: FeedbackTrendPoint[];
};

export async function getPendingFeedbackForManager(
  managerUserId: string,
  managerRole: string,
): Promise<PendingFeedbackItem[]> {
  if (!canAccessManagerSettings(managerRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return [];
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId: managerUserId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership && managerRole !== "ADMIN") return [];

  const since = new Date(Date.now() - PENDING_WINDOW_MS);

  const shifts = await prisma.shift.findMany({
    where: {
      ...(membership ? { locationId: membership.locationId } : {}),
      actualEndsAt: { gte: since },
      employeeId: { not: null },
      feedback: { is: null },
      NOT: { employeeId: managerUserId },
    },
    include: {
      employee: { select: { id: true, fullName: true } },
      station: { select: { nameFr: true } },
    },
    orderBy: { actualEndsAt: "desc" },
    take: 20,
  });

  return shifts
    .filter((s): s is typeof s & { employeeId: string; employee: { id: string; fullName: string }; actualEndsAt: Date } =>
      Boolean(s.employeeId && s.employee && s.actualEndsAt),
    )
    .map((s) => ({
      shiftId: s.id,
      employeeId: s.employeeId,
      employeeName: s.employee.fullName,
      stationId: s.stationId,
      stationNameFr: s.station.nameFr,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      actualEndsAt: s.actualEndsAt.toISOString(),
    }));
}

export async function getEmployeeFeedbackTrend(
  employeeId: string,
  locationId?: string,
): Promise<EmployeeFeedbackTrend> {
  const since = new Date();
  since.setDate(since.getDate() - TREND_WINDOW_DAYS);

  const rows = await prisma.shiftFeedback.findMany({
    where: {
      employeeId,
      createdAt: { gte: since },
      ...(locationId ? { shift: { locationId } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      ratingAttitude: true,
      ratingSpeed: true,
      ratingReliability: true,
    },
  });

  if (rows.length === 0) {
    return {
      employeeId,
      count: 0,
      averages: { attitude: 0, speed: 0, reliability: 0, overall: 0 },
      points: [],
    };
  }

  const sumA = rows.reduce((s, r) => s + r.ratingAttitude, 0);
  const sumS = rows.reduce((s, r) => s + r.ratingSpeed, 0);
  const sumR = rows.reduce((s, r) => s + r.ratingReliability, 0);
  const n = rows.length;

  const points: FeedbackTrendPoint[] = rows.map((r) => {
    const average = Number(((r.ratingAttitude + r.ratingSpeed + r.ratingReliability) / 3).toFixed(2));
    return {
      date: r.createdAt.toISOString(),
      attitude: r.ratingAttitude,
      speed: r.ratingSpeed,
      reliability: r.ratingReliability,
      average,
    };
  });

  return {
    employeeId,
    count: n,
    averages: {
      attitude: Number((sumA / n).toFixed(2)),
      speed: Number((sumS / n).toFixed(2)),
      reliability: Number((sumR / n).toFixed(2)),
      overall: Number(((sumA + sumS + sumR) / (n * 3)).toFixed(2)),
    },
    points,
  };
}

export async function getFeedbackTrendsForEmployees(
  employeeIds: string[],
  locationId: string,
): Promise<Map<string, EmployeeFeedbackTrend>> {
  const map = new Map<string, EmployeeFeedbackTrend>();
  if (employeeIds.length === 0) return map;

  await Promise.all(
    employeeIds.map(async (id) => {
      map.set(id, await getEmployeeFeedbackTrend(id, locationId));
    }),
  );

  return map;
}
