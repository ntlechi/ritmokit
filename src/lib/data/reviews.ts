import "server-only";

import type { ReviewStatus } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  aggregateFeedbackForPeriod,
  ensureDueReviewsForLocation,
} from "@/lib/reviews/cycle";

export type ReviewFeedbackSnapshot = {
  count: number;
  attitude: number | null;
  speed: number | null;
  reliability: number | null;
  overall: number | null;
};

export type QuarterlyReviewCard = {
  id: string;
  status: ReviewStatus;
  periodEndDate: string;
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  managerName: string | null;
  employeeSelfScore: number | null;
  employeeAttitude: number | null;
  employeeCulture: number | null;
  employeeStation: number | null;
  employeeComments: string | null;
  employeeSignedAt: string | null;
  managerScore: number | null;
  managerAttitude: number | null;
  managerCulture: number | null;
  managerStation: number | null;
  managerComments: string | null;
  futureGoals: string | null;
  managerSignedAt: string | null;
  feedback: ReviewFeedbackSnapshot;
  isImmutable: boolean;
};

function mapReview(
  row: {
    id: string;
    status: ReviewStatus;
    periodEndDate: Date;
    employeeId: string;
    managerId: string | null;
    employeeSelfScore: number | null;
    employeeAttitude: number | null;
    employeeCulture: number | null;
    employeeStation: number | null;
    employeeComments: string | null;
    employeeSignedAt: Date | null;
    managerScore: number | null;
    managerAttitude: number | null;
    managerCulture: number | null;
    managerStation: number | null;
    managerComments: string | null;
    futureGoals: string | null;
    managerSignedAt: Date | null;
    feedbackAvgAttitude: number | null;
    feedbackAvgSpeed: number | null;
    feedbackAvgReliability: number | null;
    feedbackAvgOverall: number | null;
    feedbackCount: number | null;
    employee: { fullName: string };
    manager: { fullName: string } | null;
  },
  liveFeedback?: ReviewFeedbackSnapshot,
): QuarterlyReviewCard {
  const frozen =
    row.status === "SIGNED_AND_COMPLETED" ||
    (row.feedbackCount != null && row.feedbackCount > 0);

  return {
    id: row.id,
    status: row.status,
    periodEndDate: row.periodEndDate.toISOString(),
    employeeId: row.employeeId,
    employeeName: row.employee.fullName,
    managerId: row.managerId,
    managerName: row.manager?.fullName ?? null,
    employeeSelfScore: row.employeeSelfScore,
    employeeAttitude: row.employeeAttitude,
    employeeCulture: row.employeeCulture,
    employeeStation: row.employeeStation,
    employeeComments: row.employeeComments,
    employeeSignedAt: row.employeeSignedAt?.toISOString() ?? null,
    managerScore: row.managerScore,
    managerAttitude: row.managerAttitude,
    managerCulture: row.managerCulture,
    managerStation: row.managerStation,
    managerComments: row.managerComments,
    futureGoals: row.futureGoals,
    managerSignedAt: row.managerSignedAt?.toISOString() ?? null,
    feedback: frozen
      ? {
          count: row.feedbackCount ?? 0,
          attitude: row.feedbackAvgAttitude,
          speed: row.feedbackAvgSpeed,
          reliability: row.feedbackAvgReliability,
          overall: row.feedbackAvgOverall,
        }
      : (liveFeedback ?? {
          count: 0,
          attitude: null,
          speed: null,
          reliability: null,
          overall: null,
        }),
    isImmutable: row.status === "SIGNED_AND_COMPLETED",
  };
}

const reviewInclude = {
  employee: { select: { fullName: true } },
  manager: { select: { fullName: true } },
} as const;

export async function getEmployeeOpenReviews(userId: string): Promise<QuarterlyReviewCard[]> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return [];

  await ensureDueReviewsForLocation(membership.locationId);

  const rows = await prisma.quarterlyReview.findMany({
    where: {
      employeeId: userId,
      locationId: membership.locationId,
      status: { in: ["PENDING_SELF_EVALUATION", "PENDING_MANAGER_INPUT", "READY_FOR_REVIEW"] },
    },
    include: reviewInclude,
    orderBy: { periodEndDate: "desc" },
  });

  return rows.map((row) => mapReview(row));
}

export async function getManagerReviewsDashboard(
  managerUserId: string,
  managerRole: string,
): Promise<{ locationId: string; locationName: string; reviews: QuarterlyReviewCard[] } | null> {
  if (!canAccessManagerSettings(managerRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return null;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId: managerUserId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
  if (!membership) return null;

  await ensureDueReviewsForLocation(membership.locationId);

  const rows = await prisma.quarterlyReview.findMany({
    where: { locationId: membership.locationId },
    include: reviewInclude,
    orderBy: [{ status: "asc" }, { periodEndDate: "desc" }],
    take: 50,
  });

  const reviews: QuarterlyReviewCard[] = [];
  for (const row of rows) {
    let live: ReviewFeedbackSnapshot | undefined;
    if (row.status !== "SIGNED_AND_COMPLETED") {
      const agg = await aggregateFeedbackForPeriod({
        employeeId: row.employeeId,
        locationId: row.locationId,
        periodEnd: row.periodEndDate,
      });
      live = {
        count: agg.count,
        attitude: agg.attitude,
        speed: agg.speed,
        reliability: agg.reliability,
        overall: agg.overall,
      };
    }
    reviews.push(mapReview(row, live));
  }

  return {
    locationId: membership.locationId,
    locationName: membership.location.name,
    reviews,
  };
}
