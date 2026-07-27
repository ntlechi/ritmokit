"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import {
  getOrCreateDirectConversation,
  initializeRecruitIntegration,
} from "@/lib/hr/buddy";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type HrExcellenceActionResult =
  | { ok: true; conversationId?: string }
  | { ok: false; error: string };

const MANAGER_ONBOARDING_PATH = "/[lang]/settings/manager/onboarding";
const TEAM_PATH = "/[lang]/team";
const MOBILE_PATH = "/[lang]/calendar/mobile";
const ONBOARDING_PATH = "/[lang]/onboarding";
const MESSAGES_PATH = "/[lang]/messages";

function revalidateHrExcellencePaths() {
  revalidatePath(MANAGER_ONBOARDING_PATH, "page");
  revalidatePath(TEAM_PATH, "page");
  revalidatePath(MOBILE_PATH, "page");
  revalidatePath(ONBOARDING_PATH, "page");
  revalidatePath(MESSAGES_PATH, "layout");
}

async function assertManagerForLocation(locationId: string) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }

  const membership = await prisma.locationMember.findUnique({
    where: { locationId_userId: { locationId, userId: user.id } },
  });
  if (!membership && user.role !== "ADMIN") {
    return { ok: false as const, error: "unauthorized" };
  }

  return { ok: true as const, user };
}

export async function assignBuddyAndGenerateChecklistAction(input: {
  locationId: string;
  recruitUserId: string;
  buddyUserId?: string;
}): Promise<HrExcellenceActionResult> {
  try {
    const auth = await assertManagerForLocation(input.locationId);
    if (!auth.ok) return auth;

    const recruitMember = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: input.locationId, userId: input.recruitUserId },
      },
    });
    if (!recruitMember) return { ok: false, error: "recruit_not_found" };

    if (input.buddyUserId && input.buddyUserId === input.recruitUserId) {
      return { ok: false, error: "invalid_buddy" };
    }

    if (input.buddyUserId) {
      const buddyMember = await prisma.locationMember.findUnique({
        where: {
          locationId_userId: { locationId: input.locationId, userId: input.buddyUserId },
        },
      });
      if (!buddyMember) return { ok: false, error: "buddy_not_found" };
    }

    await initializeRecruitIntegration({
      locationId: input.locationId,
      recruitUserId: input.recruitUserId,
      stationId: recruitMember.stationId,
      buddyUserId: input.buddyUserId,
    });

    revalidateHrExcellencePaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("hr-excellence", error);
  }
}

export async function completeOnboardingTaskAction(input: {
  locationId: string;
  taskId: string;
  completed: boolean;
}): Promise<HrExcellenceActionResult> {
  try {
    const auth = await assertManagerForLocation(input.locationId);
    if (!auth.ok) return auth;

    const task = await prisma.onboardingTask.findFirst({
      where: { id: input.taskId, locationId: input.locationId },
    });
    if (!task) return { ok: false, error: "task_not_found" };

    await prisma.onboardingTask.update({
      where: { id: task.id },
      data: {
        completedAt: input.completed ? new Date() : null,
        completedById: input.completed ? auth.user.id : null,
      },
    });

    revalidateHrExcellencePaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("hr-excellence", error);
  }
}

/** Recrue — ouvre la messagerie directe avec son buddy (crée la conversation si besoin). */
export async function openBuddyConversationAction(): Promise<HrExcellenceActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const membership = await prisma.locationMember.findFirst({
      where: { userId: user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    if (!membership) return { ok: false, error: "no_location" };

    const hrProfile = await prisma.employeeHrProfile.findUnique({
      where: { userId: user.id },
      select: { buddyId: true },
    });
    if (!hrProfile?.buddyId) return { ok: false, error: "no_buddy" };

    const conversationId = await getOrCreateDirectConversation({
      locationId: membership.locationId,
      userIdA: user.id,
      userIdB: hrProfile.buddyId,
    });

    return { ok: true, conversationId };
  } catch (error) {
    return actionDatabaseError("hr-excellence", error);
  }
}

/** Appelé après ajout d'un membre EMPLOYEE — assignation auto du buddy + checklist. */
export async function bootstrapRecruitIntegrationAction(input: {
  locationId: string;
  recruitUserId: string;
  stationId: string;
}): Promise<void> {
  try {
    await initializeRecruitIntegration({
      locationId: input.locationId,
      recruitUserId: input.recruitUserId,
      stationId: input.stationId,
    });
    revalidateHrExcellencePaths();
  } catch {
    // Non bloquant pour l'ajout d'équipe
  }
}
