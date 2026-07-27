"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { aggregateFeedbackForPeriod, ensureDueReviewsForLocation } from "@/lib/reviews/cycle";

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

const MOBILE_PATH = "/[lang]/calendar/mobile";
const REVIEWS_PATH = "/[lang]/settings/manager/reviews";
const ONBOARDING_PATH = "/[lang]/settings/manager/onboarding";
const TEAM_PATH = "/[lang]/team";

function revalidateReviewPaths() {
  revalidatePath(MOBILE_PATH, "page");
  revalidatePath(REVIEWS_PATH, "page");
  revalidatePath(ONBOARDING_PATH, "page");
  revalidatePath(TEAM_PATH, "page");
  revalidatePath("/[lang]/settings/manager", "page");
}

function clampScore(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

async function clientIp(): Promise<string | null> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? headerStore.get("x-real-ip") ?? null;
}

export async function ensureDueReviewsAction(locationId: string): Promise<ReviewActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }
    await ensureDueReviewsForLocation(locationId);
    revalidateReviewPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("reviews", error);
  }
}

export async function submitEmployeeSelfEvaluationAction(input: {
  reviewId: string;
  attitude: number;
  culture: number;
  station: number;
  comments?: string;
  signatureName: string;
}): Promise<ReviewActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const attitude = clampScore(input.attitude);
    const culture = clampScore(input.culture);
    const station = clampScore(input.station);
    if (attitude == null || culture == null || station == null) {
      return { ok: false, error: "invalid_score" };
    }

    const signatureName = input.signatureName.trim();
    if (signatureName.length < 2) return { ok: false, error: "invalid_signature" };

    const review = await prisma.quarterlyReview.findUnique({ where: { id: input.reviewId } });
    if (!review || review.employeeId !== user.id) return { ok: false, error: "unauthorized" };
    if (review.status !== "PENDING_SELF_EVALUATION") {
      return { ok: false, error: "invalid_status" };
    }

    const selfScore = Math.round((attitude + culture + station) / 3);
    const ip = await clientIp();

    await prisma.quarterlyReview.update({
      where: { id: review.id },
      data: {
        employeeAttitude: attitude,
        employeeCulture: culture,
        employeeStation: station,
        employeeSelfScore: selfScore,
        employeeComments: input.comments?.trim().slice(0, 2000) || null,
        employeeSignedAt: new Date(),
        employeeSignatureIp: ip,
        employeeSignatureName: signatureName,
        status: "PENDING_MANAGER_INPUT",
      },
    });

    revalidateReviewPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("reviews", error);
  }
}

export async function submitManagerReviewAction(input: {
  reviewId: string;
  attitude: number;
  culture: number;
  station: number;
  comments?: string;
  goals?: string;
}): Promise<ReviewActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const attitude = clampScore(input.attitude);
    const culture = clampScore(input.culture);
    const station = clampScore(input.station);
    if (attitude == null || culture == null || station == null) {
      return { ok: false, error: "invalid_score" };
    }

    const review = await prisma.quarterlyReview.findUnique({ where: { id: input.reviewId } });
    if (!review) return { ok: false, error: "not_found" };
    if (review.status !== "PENDING_MANAGER_INPUT" && review.status !== "READY_FOR_REVIEW") {
      return { ok: false, error: "invalid_status" };
    }

    const membership = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: review.locationId, userId: user.id },
      },
    });
    if (!membership && user.role !== "ADMIN") return { ok: false, error: "unauthorized" };

    const feedback = await aggregateFeedbackForPeriod({
      employeeId: review.employeeId,
      locationId: review.locationId,
      periodEnd: review.periodEndDate,
    });

    const managerScore = Math.round((attitude + culture + station) / 3);

    await prisma.quarterlyReview.update({
      where: { id: review.id },
      data: {
        managerId: user.id,
        managerAttitude: attitude,
        managerCulture: culture,
        managerStation: station,
        managerScore,
        managerComments: input.comments?.trim().slice(0, 2000) || null,
        futureGoals: input.goals?.trim().slice(0, 2000) || null,
        feedbackAvgAttitude: feedback.attitude,
        feedbackAvgSpeed: feedback.speed,
        feedbackAvgReliability: feedback.reliability,
        feedbackAvgOverall: feedback.overall,
        feedbackCount: feedback.count,
        status: "READY_FOR_REVIEW",
      },
    });

    revalidateReviewPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("reviews", error);
  }
}

export async function signAndCompleteReviewAction(input: {
  reviewId: string;
  signatureName: string;
}): Promise<ReviewActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const signatureName = input.signatureName.trim();
    if (signatureName.length < 2) return { ok: false, error: "invalid_signature" };

    const review = await prisma.quarterlyReview.findUnique({ where: { id: input.reviewId } });
    if (!review) return { ok: false, error: "not_found" };
    if (review.status !== "READY_FOR_REVIEW") return { ok: false, error: "invalid_status" };
    if (!review.employeeSignedAt) return { ok: false, error: "employee_not_signed" };

    const membership = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: review.locationId, userId: user.id },
      },
    });
    if (!membership && user.role !== "ADMIN") return { ok: false, error: "unauthorized" };

    const ip = await clientIp();

    await prisma.quarterlyReview.update({
      where: { id: review.id },
      data: {
        managerId: user.id,
        managerSignedAt: new Date(),
        managerSignatureIp: ip,
        managerSignatureName: signatureName,
        status: "SIGNED_AND_COMPLETED",
      },
    });

    revalidateReviewPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("reviews", error);
  }
}
