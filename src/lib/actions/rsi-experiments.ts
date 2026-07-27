"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import {
  isHypothesisKey,
  type ExperimentHypothesisKey,
} from "@/lib/rsi/experiment-catalog";
import {
  applyExperimentWinner,
  evaluateExperiment,
  rejectExperimentWinner,
  startExperiment,
} from "@/lib/rsi/platform-experiments";

export type RsiExperimentActionResult =
  | { ok: true }
  | { ok: false; error: string };

const CULTURE_PATH = "/[lang]/settings/manager/culture";

async function assertOrgAccess(organizationId: string, userId: string, role: string) {
  if (role === "ADMIN") return true;
  const membership = await prisma.locationMember.findFirst({
    where: {
      userId,
      location: { organizationId },
    },
  });
  return Boolean(membership);
}

async function assertExperimentAccess(
  experimentId: string,
  userId: string,
  role: string,
) {
  const exp = await prisma.productExperiment.findUnique({
    where: { id: experimentId },
    select: { id: true, organizationId: true },
  });
  if (!exp) return { ok: false as const, error: "not_found" as const };
  const allowed = await assertOrgAccess(exp.organizationId, userId, role);
  if (!allowed) return { ok: false as const, error: "unauthorized" as const };
  return { ok: true as const, experiment: exp };
}

export async function startProductExperimentAction(
  organizationId: string,
  hypothesisKey: string,
): Promise<RsiExperimentActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }
    if (!isHypothesisKey(hypothesisKey)) {
      return { ok: false, error: "invalid_hypothesis" };
    }
    const allowed = await assertOrgAccess(
      organizationId,
      sessionUser.id,
      sessionUser.role,
    );
    if (!allowed) return { ok: false, error: "unauthorized" };

    const result = await startExperiment(
      organizationId,
      hypothesisKey as ExperimentHypothesisKey,
    );
    if (!result.ok) return result;

    revalidatePath(CULTURE_PATH, "page");
    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("rsi-experiments", error);
  }
}

export async function concludeProductExperimentAction(
  experimentId: string,
): Promise<RsiExperimentActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }
    const access = await assertExperimentAccess(
      experimentId,
      sessionUser.id,
      sessionUser.role,
    );
    if (!access.ok) return { ok: false, error: access.error };

    const result = await evaluateExperiment(experimentId);
    if (!result.ok) return result;

    revalidatePath(CULTURE_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("rsi-experiments", error);
  }
}

export async function applyProductExperimentAction(
  experimentId: string,
): Promise<RsiExperimentActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }
    const access = await assertExperimentAccess(
      experimentId,
      sessionUser.id,
      sessionUser.role,
    );
    if (!access.ok) return { ok: false, error: access.error };

    const result = await applyExperimentWinner(experimentId, sessionUser.id);
    if (!result.ok) return result;

    revalidatePath(CULTURE_PATH, "page");
    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("rsi-experiments", error);
  }
}

export async function rejectProductExperimentAction(
  experimentId: string,
): Promise<RsiExperimentActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }
    const access = await assertExperimentAccess(
      experimentId,
      sessionUser.id,
      sessionUser.role,
    );
    if (!access.ok) return { ok: false, error: access.error };

    const result = await rejectExperimentWinner(experimentId, sessionUser.id);
    if (!result.ok) return result;

    revalidatePath(CULTURE_PATH, "page");
    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("rsi-experiments", error);
  }
}
