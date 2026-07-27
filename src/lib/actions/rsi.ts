"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type RsiActionResult = { ok: true } | { ok: false; error: string };

const CULTURE_PATH = "/[lang]/settings/manager/culture";

async function assertManagerOwnsInsight(insightId: string, userId: string, role: string) {
  const insight = await prisma.improvementInsight.findUnique({
    where: { id: insightId },
    select: {
      id: true,
      status: true,
      locationId: true,
      location: { select: { organizationId: true } },
    },
  });
  if (!insight) return { ok: false as const, error: "not_found" as const };

  if (role === "ADMIN") return { ok: true as const, insight };

  const membership = await prisma.locationMember.findFirst({
    where: { userId, locationId: insight.locationId },
  });
  if (!membership) return { ok: false as const, error: "unauthorized" as const };

  return { ok: true as const, insight };
}

/**
 * Gouvernance humaine RSI — le gérant applique ou rejette un insight OPEN.
 * APPLIED / DISMISSED sont finaux pour ce fingerprint (semaine).
 */
export async function updateInsightStatusAction(
  insightId: string,
  status: "APPLIED" | "DISMISSED",
): Promise<RsiActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }

    if (status !== "APPLIED" && status !== "DISMISSED") {
      return { ok: false, error: "invalid_status" };
    }

    const access = await assertManagerOwnsInsight(
      insightId,
      sessionUser.id,
      sessionUser.role,
    );
    if (!access.ok) return { ok: false, error: access.error };

    if (access.insight.status !== "OPEN") {
      return { ok: false, error: "already_resolved" };
    }

    await prisma.improvementInsight.update({
      where: { id: insightId },
      data: {
        status,
        updatedById: sessionUser.id,
        appliedAt: status === "APPLIED" ? new Date() : null,
      },
    });

    revalidatePath(CULTURE_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("rsi", error);
  }
}
