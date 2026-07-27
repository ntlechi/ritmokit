"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { getFormationModuleForUser } from "@/lib/data/training";
import { refreshOnboardingStatus } from "@/lib/hr/onboarding";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type TrainingActionResult = { ok: true } | { ok: false; error: string };

const SOPS_PATH = "/[lang]/sops";
const PUNCH_PATH = "/[lang]/pointeuse";
const ONBOARDING_PATH = "/[lang]/onboarding";

function revalidateTrainingPaths() {
  revalidatePath(SOPS_PATH, "page");
  revalidatePath(`${SOPS_PATH}/[moduleId]`, "page");
  revalidatePath(PUNCH_PATH, "page");
  revalidatePath(ONBOARDING_PATH, "page");
}

export async function completeFormationModuleAction(
  moduleId: string,
  signatureName: string,
): Promise<TrainingActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const formationModule = await prisma.formationModule.findUnique({ where: { id: moduleId } });
    if (!formationModule || !formationModule.isActive) return { ok: false, error: "module_not_found" };

    const trimmedSignature = signatureName.trim();
    if (formationModule.requiresSignature && trimmedSignature.length < 2) {
      return { ok: false, error: "invalid_signature" };
    }

    // Une seule règle d'accès pour la lecture et la signature : le module doit
    // être dans le catalogue de l'employé (voir resolveVisibility).
    const visible = await getFormationModuleForUser(user.id, moduleId);
    if (!visible) return { ok: false, error: "unauthorized" };
    if (!visible.unlocked) return { ok: false, error: "locked" };

    const existing = await prisma.employeeFormationProgress.findUnique({
      where: { userId_moduleId: { userId: user.id, moduleId } },
    });
    if (existing?.status === "COMPLETED") return { ok: false, error: "already_completed" };

    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    const ipAddress = forwarded?.split(",")[0]?.trim() ?? headerStore.get("x-real-ip") ?? null;
    const now = new Date();

    await prisma.employeeFormationProgress.upsert({
      where: { userId_moduleId: { userId: user.id, moduleId } },
      update: {
        status: "COMPLETED",
        signatureName: formationModule.requiresSignature ? trimmedSignature : null,
        signedAt: formationModule.requiresSignature ? now : null,
        ipAddress: formationModule.requiresSignature ? ipAddress : null,
        completedAt: now,
      },
      create: {
        userId: user.id,
        moduleId,
        status: "COMPLETED",
        signatureName: formationModule.requiresSignature ? trimmedSignature : null,
        signedAt: formationModule.requiresSignature ? now : null,
        ipAddress: formationModule.requiresSignature ? ipAddress : null,
        completedAt: now,
      },
    });

    await refreshOnboardingStatus(user.id);
    revalidateTrainingPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("training", error);
  }
}
