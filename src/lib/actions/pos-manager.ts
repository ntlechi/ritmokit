"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type PosManagerActionResult =
  | { ok: true; secret: string }
  | { ok: false; error: string };

const MANAGER_POS_PATH = "/[lang]/settings/manager/pos";

export async function rotatePosWebhookSecretAction(
  locationId: string,
): Promise<PosManagerActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await prisma.locationMember.findUnique({
      where: { locationId_userId: { locationId, userId: user.id } },
    });
    if (!membership) return { ok: false, error: "unauthorized" };

    const integration = await prisma.posIntegration.findUnique({ where: { locationId } });
    if (!integration) return { ok: false, error: "integration_not_found" };

    const newSecret = randomBytes(32).toString("hex");

    await prisma.posIntegration.update({
      where: { locationId },
      data: { webhookSecret: newSecret },
    });

    revalidatePath(MANAGER_POS_PATH, "page");
    return { ok: true, secret: newSecret };
  } catch (error) {
    return actionDatabaseError("pos-manager", error);
  }
}
