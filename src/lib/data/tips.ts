import "server-only";

import type { VoteStatus } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session";
import {
  distributeLocationTips,
  getTorontoDayBounds,
  serializeTipPoolConfig,
  type TipPoolConfigSnapshot,
  type StationTipPoints,
} from "@/lib/finance/tips";
import { countEligibleEmployeeVoters, requiredVotesToPass } from "@/lib/tips/vote";
import { resolveTipAgreementTextForLocale } from "@/lib/tips/agreement-template";
import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";

export type EmployeeTipEntry = {
  shiftId: string;
  startsAt: string;
  endsAt: string;
  stationId: string;
  stationNameFr: string;
  stationNameEn: string;
  stationNameEs: string;
  stationColorHex: string;
  workedHours: number;
  stationPoints: number;
  amountPaid: number;
  distributedAt: string;
};

export type EmployeeTipsSummary = {
  poolConfig: TipPoolConfigSnapshot | null;
  entries: EmployeeTipEntry[];
  periodTotal: number;
};

export type EmployeeVoteBallot = {
  configId: string;
  agreementText: string;
  hasVoted: boolean;
  userVote: { isApproved: boolean; signatureName: string } | null;
};

export type TipVoteRecord = {
  userId: string;
  fullName: string;
  isApproved: boolean;
  signatureName: string;
  signedAt: string;
};

export type ManagerVoteBallot = {
  configId: string;
  status: VoteStatus;
  agreementText: string | null;
  totalEmployees: number;
  votesCast: number;
  yesVotes: number;
  noVotes: number;
  requiredToPass: number;
  votes: TipVoteRecord[];
};

export type ManagerTipsDayPreview = {
  date: string;
  completedShiftCount: number;
  alreadyDistributed: boolean;
  distributedTotal: number | null;
  poolConfig: TipPoolConfigSnapshot | null;
  /** Somme des pourboires captés par Cluster POS pour ce jour d'affaires — `null` si aucune donnée POS. */
  posTipsTotal: number | null;
};

export type ManagerTipsReport = {
  locationId: string;
  locationName: string;
  poolConfig: TipPoolConfigSnapshot | null;
  stations: StationTipPoints[];
  voteBallot: ManagerVoteBallot | null;
  todayPreview: ManagerTipsDayPreview;
  recentDistributions: Array<{
    id: string;
    distributionDate: string;
    totalTipsCollected: number;
    shiftCount: number;
    distributedAt: string;
  }>;
};

async function getManagerLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
}

export async function getEmployeeTipsSummary(userId: string): Promise<EmployeeTipsSummary> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const poolConfigRow = membership
    ? await prisma.tipPoolConfig.findUnique({ where: { locationId: membership.locationId } })
    : null;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const tipRows = await prisma.shiftTipEarned.findMany({
    where: {
      shift: { employeeId: userId, actualEndsAt: { gte: thirtyDaysAgo } },
    },
    include: {
      shift: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          stationId: true,
          station: { select: { nameFr: true, nameEn: true, nameEs: true, colorHex: true } },
        },
      },
      distribution: { select: { distributedAt: true } },
    },
    orderBy: { declaredAt: "desc" },
    take: 20,
  });

  const entries: EmployeeTipEntry[] = tipRows.map((row) => ({
    shiftId: row.shift.id,
    startsAt: row.shift.startsAt.toISOString(),
    endsAt: row.shift.endsAt.toISOString(),
    stationId: row.shift.stationId,
    stationNameFr: row.shift.station.nameFr,
    stationNameEn: row.shift.station.nameEn,
    stationNameEs: row.shift.station.nameEs,
    stationColorHex: row.shift.station.colorHex,
    workedHours: asPlainNumber(row.workedHours),
    stationPoints: asPlainNumber(row.stationPoints),
    amountPaid: asPlainNumber(row.amountPaid),
    distributedAt: row.distribution.distributedAt.toISOString(),
  }));

  const periodTotal = entries.reduce((sum, e) => sum + e.amountPaid, 0);

  return {
    poolConfig: poolConfigRow ? serializeTipPoolConfig(poolConfigRow) : null,
    entries,
    periodTotal: Math.round(periodTotal * 100) / 100,
  };
}

export async function getEmployeeVoteBallot(
  userId: string,
  lang: Locale,
): Promise<EmployeeVoteBallot | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId, user: { role: "EMPLOYEE" } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return null;

  const config = await prisma.tipPoolConfig.findUnique({
    where: { locationId: membership.locationId },
  });
  if (!config || config.status !== "VOTING" || !config.agreementText) return null;

  const existing = await prisma.tipPoolVote.findUnique({
    where: { configId_userId: { configId: config.id, userId } },
  });

  return {
    configId: config.id,
    agreementText: resolveTipAgreementTextForLocale(config.agreementText, lang),
    hasVoted: Boolean(existing),
    userVote: existing
      ? { isApproved: existing.isApproved, signatureName: existing.signatureName }
      : null,
  };
}

async function buildVoteBallot(locationId: string): Promise<ManagerVoteBallot | null> {
  const config = await prisma.tipPoolConfig.findUnique({ where: { locationId } });
  if (!config) return null;

  const [totalEmployees, voteRows] = await Promise.all([
    countEligibleEmployeeVoters(locationId),
    prisma.tipPoolVote.findMany({
      where: { configId: config.id },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { signedAt: "desc" },
    }),
  ]);

  const yesVotes = voteRows.filter((v) => v.isApproved).length;

  return {
    configId: config.id,
    status: config.status,
    agreementText: config.agreementText,
    totalEmployees,
    votesCast: voteRows.length,
    yesVotes,
    noVotes: voteRows.length - yesVotes,
    requiredToPass: requiredVotesToPass(totalEmployees),
    votes: voteRows.map((v) => ({
      userId: v.user.id,
      fullName: v.user.fullName,
      isApproved: v.isApproved,
      signatureName: v.signatureName,
      signedAt: v.signedAt.toISOString(),
    })),
  };
}

export async function getManagerTipsReportForUser(userId: string, userRole: string) {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const membership = await getManagerLocation(userId);
  if (!membership) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const locationId = membership.locationId;
  const [poolConfigRow, recentDistributions, voteBallot, stationRows] = await Promise.all([
    prisma.tipPoolConfig.findUnique({ where: { locationId } }),
    prisma.tipDistribution.findMany({
      where: { locationId },
      include: { _count: { select: { shiftTips: true } } },
      orderBy: { distributionDate: "desc" },
      take: 10,
    }),
    buildVoteBallot(locationId),
    prisma.station.findMany({
      where: { locationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
      select: { id: true, nameFr: true, nameEn: true, nameEs: true, tipPoints: true },
    }),
  ]);

  const today = new Date();
  const todayPreview = await buildDayPreview(locationId, today, poolConfigRow);

  const report: ManagerTipsReport = {
    locationId,
    locationName: membership.location.name,
    poolConfig: poolConfigRow ? serializeTipPoolConfig(poolConfigRow) : null,
    stations: stationRows.map((s) => ({
      id: s.id,
      nameFr: s.nameFr,
      nameEn: s.nameEn,
      nameEs: s.nameEs,
      tipPoints: asPlainNumber(s.tipPoints),
    })),
    voteBallot,
    todayPreview,
    recentDistributions: recentDistributions.map((d) => ({
      id: d.id,
      distributionDate: d.distributionDate.toISOString(),
      totalTipsCollected: asPlainNumber(d.totalTipsCollected),
      shiftCount: d._count.shiftTips,
      distributedAt: d.distributedAt.toISOString(),
    })),
  };

  return { ok: true as const, data: report };
}

async function buildDayPreview(
  locationId: string,
  date: Date,
  poolConfigRow: Awaited<ReturnType<typeof prisma.tipPoolConfig.findUnique>>,
): Promise<ManagerTipsDayPreview> {
  const { dayStart, dayEnd, distributionDate } = getTorontoDayBounds(date);

  const [completedShiftCount, existing, posSalesRows] = await Promise.all([
    prisma.shift.count({
      where: {
        locationId,
        employeeId: { not: null },
        actualStartsAt: { not: null },
        actualEndsAt: { gte: dayStart, lt: dayEnd },
        tipEarned: null,
      },
    }),
    prisma.tipDistribution.findUnique({
      where: { locationId_distributionDate: { locationId, distributionDate } },
    }),
    prisma.posSalesHourly.findMany({
      where: { locationId, date: distributionDate },
      select: { tipsCollected: true },
    }),
  ]);

  const posTipsTotal =
    posSalesRows.length > 0
      ? round2(posSalesRows.reduce((total, row) => total + asPlainNumber(row.tipsCollected), 0))
      : null;

  return {
    date: distributionDate.toISOString(),
    completedShiftCount,
    alreadyDistributed: Boolean(existing),
    distributedTotal: existing ? asPlainNumber(existing.totalTipsCollected) : null,
    poolConfig: poolConfigRow ? serializeTipPoolConfig(poolConfigRow) : null,
    posTipsTotal,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function runTipsDistributionForManager(input: {
  userId: string;
  userRole: string;
  date: Date;
  totalTipsCollected: number;
}) {
  if (!canAccessManagerSettings(input.userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const membership = await getManagerLocation(input.userId);
  if (!membership) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const result = await distributeLocationTips({
    locationId: membership.locationId,
    date: input.date,
    totalTipsCollected: input.totalTipsCollected,
    distributedById: input.userId,
  });

  return result;
}
