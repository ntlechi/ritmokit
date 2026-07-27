"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { applyVoteOutcome } from "@/lib/tips/vote";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type TipVoteActionResult = { ok: true } | { ok: false; error: string };

const MANAGER_TIPS_PATH = "/[lang]/settings/manager/tips";
const MOBILE_PATH = "/[lang]/calendar/mobile";
const PUNCH_PATH = "/[lang]/pointeuse";

export async function startTipPoolVoteAction(
  locationId: string,
  agreementText: string,
): Promise<TipVoteActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const trimmed = agreementText.trim();
    if (trimmed.length < 50) return { ok: false, error: "agreement_too_short" };

    const membership = await prisma.locationMember.findUnique({
      where: { locationId_userId: { locationId, userId: user.id } },
    });
    if (!membership) return { ok: false, error: "unauthorized" };

    const config = await prisma.tipPoolConfig.upsert({
      where: { locationId },
      update: {
        status: "VOTING",
        agreementText: trimmed,
        isActive: false,
        votedAt: null,
      },
      create: {
        locationId,
        status: "VOTING",
        agreementText: trimmed,
        isActive: false,
      },
    });

    await prisma.tipPoolVote.deleteMany({ where: { configId: config.id } });

    revalidateVotePaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("tip-votes", error);
  }
}

export async function submitTipVoteAction(
  configId: string,
  isApproved: boolean,
  signatureName: string,
): Promise<TipVoteActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };
    if (user.role !== "EMPLOYEE") return { ok: false, error: "only_employees_can_vote" };

    const trimmedSignature = signatureName.trim();
    if (trimmedSignature.length < 2) return { ok: false, error: "invalid_signature" };

    const config = await prisma.tipPoolConfig.findUnique({ where: { id: configId } });
    if (!config || config.status !== "VOTING") return { ok: false, error: "no_active_vote" };

    const membership = await prisma.locationMember.findUnique({
      where: { locationId_userId: { locationId: config.locationId, userId: user.id } },
    });
    if (!membership) return { ok: false, error: "unauthorized" };

    const existing = await prisma.tipPoolVote.findUnique({
      where: { configId_userId: { configId, userId: user.id } },
    });
    if (existing) return { ok: false, error: "already_voted" };

    const reqHeaders = await headers();
    const forwarded = reqHeaders.get("x-forwarded-for");
    const ipAddress = forwarded?.split(",")[0]?.trim() ?? reqHeaders.get("x-real-ip") ?? null;

    await prisma.tipPoolVote.create({
      data: {
        configId,
        userId: user.id,
        isApproved,
        signatureName: trimmedSignature,
        ipAddress,
      },
    });

    await applyVoteOutcome(configId);
    revalidateVotePaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("tip-votes", error);
  }
}

function revalidateVotePaths() {
  revalidatePath(MANAGER_TIPS_PATH, "page");
  revalidatePath(MOBILE_PATH, "page");
  revalidatePath(PUNCH_PATH, "page");
}
