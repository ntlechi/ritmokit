"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type FeedbackActionResult = { ok: true } | { ok: false; error: string };

const PUNCH_PATH = "/[lang]/pointeuse";
const ONBOARDING_PATH = "/[lang]/settings/manager/onboarding";
const TEAM_PATH = "/[lang]/team";
const CALENDAR_PATH = "/[lang]/calendar";

function clampRating(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

function revalidateFeedbackPaths() {
  revalidatePath(PUNCH_PATH, "page");
  revalidatePath(ONBOARDING_PATH, "page");
  revalidatePath(TEAM_PATH, "page");
  revalidatePath(CALENDAR_PATH, "layout");
  revalidatePath("/[lang]/settings/manager", "page");
}

export async function submitShiftFeedbackAction(input: {
  shiftId: string;
  ratingAttitude: number;
  ratingSpeed: number;
  ratingReliability: number;
  comment?: string;
}): Promise<FeedbackActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const attitude = clampRating(input.ratingAttitude);
    const speed = clampRating(input.ratingSpeed);
    const reliability = clampRating(input.ratingReliability);
    if (attitude == null || speed == null || reliability == null) {
      return { ok: false, error: "invalid_rating" };
    }

    const comment = input.comment?.trim().slice(0, 140) || null;

    const shift = await prisma.shift.findUnique({
      where: { id: input.shiftId },
      select: {
        id: true,
        locationId: true,
        employeeId: true,
        actualEndsAt: true,
        feedback: { select: { id: true } },
      },
    });

    if (!shift) return { ok: false, error: "shift_not_found" };
    if (!shift.employeeId) return { ok: false, error: "no_employee" };
    if (!shift.actualEndsAt) return { ok: false, error: "not_clocked_out" };
    if (shift.feedback) return { ok: false, error: "already_submitted" };
    if (shift.employeeId === sessionUser.id) return { ok: false, error: "cannot_self_rate" };

    const membership = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: shift.locationId, userId: sessionUser.id },
      },
    });
    if (!membership && sessionUser.role !== "ADMIN") {
      return { ok: false, error: "unauthorized" };
    }

    await prisma.shiftFeedback.create({
      data: {
        shiftId: shift.id,
        employeeId: shift.employeeId,
        submittedById: sessionUser.id,
        ratingAttitude: attitude,
        ratingSpeed: speed,
        ratingReliability: reliability,
        comment,
      },
    });

    revalidateFeedbackPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("feedback", error);
  }
}

export async function dismissFeedbackPromptAction(shiftId: string): Promise<FeedbackActionResult> {
  // Soft dismiss is client-side only for now; keep action for future audit trail.
  void shiftId;
  return { ok: true };
}
