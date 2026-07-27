import "server-only";

import type { ShiftStatus } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const ASSIDUITY_TARGET_RATE = 92;
export const ASSIDUITY_WINDOW_DAYS = 30;

export type ReplacementStatus = "confirmed" | "pending" | "matched" | "unresolved" | "none";

export type AssiduityAlert = {
  id: string;
  createdAt: string;
  employeeId: string | null;
  employeeName: string;
  shiftDate: string;
  shiftId: string | null;
  severity: "HIGH" | "LOW";
  policyViolation: string;
  motive: string | null;
  replacementStatus: ReplacementStatus;
  replacementCandidate: string | null;
  breakTakenMinutes: number | null;
  breakRequiredMinutes: number | null;
};

export type TeamAssiduitySummary = {
  currentRate: number;
  targetRate: number;
  highAlertCount: number;
  totalShiftsWindow: number;
  periodDays: number;
};

export type ManagerAssiduityReport = {
  locationId: string;
  locationName: string;
  alerts: AssiduityAlert[];
  summary: TeamAssiduitySummary;
};

type PolicyPayload = {
  auditType?: string;
  sourceAgentLogId?: string;
  agentName?: string;
  employeeId?: string | null;
  locationId?: string;
  policyViolation?: string;
  severity?: "HIGH" | "LOW";
  shiftStartsAt?: string;
  actionTaken?: string;
  breakTakenMinutes?: number;
  breakRequiredMinutes?: number;
};

type CrisisResult = {
  matched?: boolean;
  candidateName?: string;
  swapRequestId?: string;
};

export async function getManagerAssiduityForUser(userId: string, userRole: string) {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });

  if (!membership) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const report = await buildAssiduityReport(membership.locationId, membership.location.name);
  return { ok: true as const, data: report };
}

async function buildAssiduityReport(
  locationId: string,
  locationName: string,
): Promise<ManagerAssiduityReport> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - ASSIDUITY_WINDOW_DAYS);

  const [logs, totalShiftsWindow] = await Promise.all([
    prisma.agentLog.findMany({
      where: {
        AND: [
          { payload: { path: ["auditType"], equals: "policy_assiduity" } },
          { payload: { path: ["locationId"], equals: locationId } },
          { payload: { path: ["severity"], equals: "HIGH" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.shift.count({
      where: {
        locationId,
        startsAt: { gte: windowStart },
        status: { notIn: ["DRAFT", "REJECTED"] },
      },
    }),
  ]);

  const highAlertCount = logs.filter((log) => log.createdAt >= windowStart).length;
  const currentRate = Math.min(
    100,
    Math.round(((Math.max(totalShiftsWindow - highAlertCount, 0)) / Math.max(totalShiftsWindow, 1)) * 100),
  );

  const alerts = await enrichAlerts(logs);

  return {
    locationId,
    locationName,
    alerts,
    summary: {
      currentRate,
      targetRate: ASSIDUITY_TARGET_RATE,
      highAlertCount,
      totalShiftsWindow,
      periodDays: ASSIDUITY_WINDOW_DAYS,
    },
  };
}

async function enrichAlerts(
  logs: Array<{
    id: string;
    createdAt: Date;
    relatedShiftId: string | null;
    payload: unknown;
  }>,
): Promise<AssiduityAlert[]> {
  if (logs.length === 0) return [];

  const payloads = logs.map((log) => parsePayload(log.payload));
  const employeeIds = [...new Set(payloads.map((p) => p.employeeId).filter(Boolean))] as string[];
  const sourceLogIds = [...new Set(payloads.map((p) => p.sourceAgentLogId).filter(Boolean))] as string[];
  const shiftIds = [
    ...new Set(
      logs.map((log) => log.relatedShiftId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const [users, sourceLogs, shifts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, fullName: true },
    }),
    prisma.agentLog.findMany({
      where: { id: { in: sourceLogIds } },
      select: { id: true, result: true },
    }),
    prisma.shift.findMany({
      where: { id: { in: shiftIds } },
      select: { id: true, status: true, notes: true },
    }),
  ]);

  const userMap = new Map(users.map((user) => [user.id, user.fullName]));
  const sourceMap = new Map(sourceLogs.map((log) => [log.id, log.result as CrisisResult | null]));
  const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));

  const motives = await resolveMotives(shiftIds, shiftMap);

  return logs.map((log) => {
    const payload = parsePayload(log.payload);
    const employeeId = payload.employeeId ?? null;
    const shiftId = log.relatedShiftId;
    const shift = shiftId ? shiftMap.get(shiftId) : undefined;
    const crisisResult = payload.sourceAgentLogId
      ? sourceMap.get(payload.sourceAgentLogId)
      : undefined;

    const replacement = resolveReplacementStatus(shift?.status, crisisResult);

    return {
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      employeeId,
      employeeName: employeeId ? (userMap.get(employeeId) ?? "—") : "—",
      shiftDate: payload.shiftStartsAt ?? log.createdAt.toISOString(),
      shiftId,
      severity: payload.severity ?? "HIGH",
      policyViolation: payload.policyViolation ?? "SHORT_NOTICE_DROP_UNDER_4_WEEKS",
      motive: shiftId ? (motives.get(shiftId) ?? payload.actionTaken ?? null) : (payload.actionTaken ?? null),
      replacementStatus: replacement.status,
      replacementCandidate: replacement.candidateName,
      breakTakenMinutes: payload.breakTakenMinutes ?? null,
      breakRequiredMinutes: payload.breakRequiredMinutes ?? null,
    };
  });
}

function parsePayload(payload: unknown): PolicyPayload {
  if (!payload || typeof payload !== "object") return {};
  return payload as PolicyPayload;
}

function resolveReplacementStatus(
  shiftStatus: ShiftStatus | undefined,
  crisisResult: CrisisResult | null | undefined,
): { status: ReplacementStatus; candidateName: string | null } {
  if (!crisisResult?.matched) {
    return { status: crisisResult ? "unresolved" : "none", candidateName: null };
  }

  if (shiftStatus === "CONFIRMED") {
    return { status: "confirmed", candidateName: crisisResult.candidateName ?? null };
  }

  if (shiftStatus === "PENDING_CONFIRMATION") {
    return { status: "pending", candidateName: crisisResult.candidateName ?? null };
  }

  return { status: "matched", candidateName: crisisResult.candidateName ?? null };
}

async function resolveMotives(
  shiftIds: string[],
  shiftMap: Map<string, { id: string; status: ShiftStatus; notes: string | null }>,
) {
  const motives = new Map<string, string>();
  if (shiftIds.length === 0) return motives;

  const chatMessages = await prisma.chatMessage.findMany({
    where: {
      OR: shiftIds.map((shiftId) => ({
        metadata: { path: ["shiftId"], equals: shiftId },
      })),
    },
    orderBy: { createdAt: "desc" },
    select: { body: true, metadata: true },
  });

  for (const message of chatMessages) {
    const shiftId = extractShiftId(message.metadata);
    if (!shiftId || motives.has(shiftId)) continue;
    motives.set(shiftId, message.body);
  }

  const swapRequests = await prisma.shiftSwapRequest.findMany({
    where: { shiftId: { in: shiftIds } },
    orderBy: { createdAt: "desc" },
    select: { shiftId: true, reason: true },
  });

  for (const swap of swapRequests) {
    if (!motives.has(swap.shiftId) && swap.reason) {
      motives.set(swap.shiftId, swap.reason);
    }
  }

  for (const shiftId of shiftIds) {
    if (motives.has(shiftId)) continue;
    const notes = shiftMap.get(shiftId)?.notes;
    if (notes) motives.set(shiftId, notes);
  }

  return motives;
}

function extractShiftId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const shiftId = (metadata as { shiftId?: unknown }).shiftId;
  return typeof shiftId === "string" ? shiftId : null;
}
