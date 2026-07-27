import "server-only";

import type { RequestStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type TimeOffRequestEntry = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: RequestStatus;
  reviewedAt: string | null;
  createdAt: string;
  employeeName: string;
  employeeId: string;
  reviewerName: string | null;
};

function serializeRequest(row: {
  id: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: RequestStatus;
  reviewedAt: Date | null;
  createdAt: Date;
  profile: { userId: string; user: { fullName: string } };
  reviewer: { fullName: string } | null;
}): TimeOffRequestEntry {
  return {
    id: row.id,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    reason: row.reason,
    status: row.status,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    employeeName: row.profile.user.fullName,
    employeeId: row.profile.userId,
    reviewerName: row.reviewer?.fullName ?? null,
  };
}

export async function getTimeOffHistoryForUser(userId: string): Promise<TimeOffRequestEntry[]> {
  const profile = await prisma.employeeProfile.findUnique({
    where: { userId },
    include: {
      timeOffRequests: {
        orderBy: { createdAt: "desc" },
        include: {
          profile: { include: { user: true } },
          reviewer: true,
        },
      },
    },
  });
  if (!profile) return [];

  return profile.timeOffRequests.map(serializeRequest);
}

export async function getPendingTimeOffForManager(managerId: string): Promise<TimeOffRequestEntry[]> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId: managerId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return [];

  const locationUserIds = await prisma.locationMember.findMany({
    where: { locationId: membership.locationId },
    select: { userId: true },
  });
  const userIds = locationUserIds.map((row) => row.userId);

  const rows = await prisma.timeOffRequest.findMany({
    where: {
      status: "PENDING",
      profile: { userId: { in: userIds } },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    include: {
      profile: { include: { user: true } },
      reviewer: true,
    },
  });

  return rows.map(serializeRequest);
}
