"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import {
  findAvailableReplacementsForShift,
  type RejectionReason,
} from "@/lib/agents/find-available-replacements";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { isTrainingCompliantForShift } from "@/lib/training/compliance";
import { formatTimeRange } from "@/lib/calendar/format";
import type { Locale } from "@/lib/i18n/config";

const MANAGER_SCHEDULE_PATH = "/[lang]/calendar/manager/schedule";
const WEEK_PATH = "/[lang]/calendar/week";
const PUNCH_PATH = "/[lang]/pointeuse";

export type ReplacementScanResult =
  | {
      ok: true;
      candidates: { userId: string; fullName: string; profilePictureUrl: string | null }[];
      rejections: {
        userId: string;
        fullName: string;
        profilePictureUrl: string | null;
        reason: RejectionReason;
      }[];
      scanned: number;
    }
  | { ok: false; error: string };

export type ReplacementActionResult = { ok: true } | { ok: false; error: string };

async function requireManagerForShift(shiftId: string) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      locationId: true,
      stationId: true,
      station: { select: { nameFr: true } },
      startsAt: true,
      endsAt: true,
      employeeId: true,
    },
  });
  if (!shift) return { ok: false as const, error: "shift_not_found" as const };

  const membership = await prisma.locationMember.findFirst({
    where: { userId: user.id, locationId: shift.locationId },
  });
  if (!membership) return { ok: false as const, error: "unauthorized" as const };

  return { ok: true as const, user, shift };
}

function revalidateReplacementPaths() {
  revalidatePath(MANAGER_SCHEDULE_PATH, "page");
  revalidatePath(WEEK_PATH, "page");
  revalidatePath(PUNCH_PATH, "page");
  revalidatePath("/[lang]/calendar/mobile", "page");
}

/** Expose le moteur de matching CNESST/dispos/formations au gérant en temps réel. */
export async function scanReplacementsAction(shiftId: string): Promise<ReplacementScanResult> {
  try {
    const access = await requireManagerForShift(shiftId);
    if (!access.ok) return { ok: false, error: access.error };

    const fullShift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
    const result = await findAvailableReplacementsForShift(fullShift);

    return {
      ok: true,
      candidates: result.candidates.map((c) => ({
        userId: c.userId,
        fullName: c.fullName,
        profilePictureUrl: c.profilePictureUrl,
      })),
      rejections: result.rejections,
      scanned: result.scanned,
    };
  } catch (error) {
    return actionDatabaseError("replacement", error);
  }
}

/** Assignation flash — met le quart en attente de confirmation par l'employé ciblé. */
export async function assignReplacementAction(
  shiftId: string,
  targetUserId: string,
): Promise<ReplacementActionResult> {
  try {
    const access = await requireManagerForShift(shiftId);
    if (!access.ok) return { ok: false, error: access.error };

    const { user, shift } = access;

    const targetMember = await prisma.locationMember.findFirst({
      where: { locationId: shift.locationId, userId: targetUserId },
    });
    if (!targetMember) return { ok: false, error: "candidate_not_found" };

    const training = await isTrainingCompliantForShift(targetUserId, shift.stationId, shift.locationId);
    if (!training.compliant) return { ok: false, error: "training_incomplete" };

    const scan = await findAvailableReplacementsForShift(
      await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } }),
    );
    if (!scan.candidates.some((c) => c.userId === targetUserId)) {
      return { ok: false, error: "candidate_not_eligible" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id: shiftId },
        data: {
          employeeId: targetUserId,
          status: "PENDING_CONFIRMATION",
        },
      });

      await tx.shiftSwapRequest.create({
        data: {
          shiftId,
          requestedById: user.id,
          targetEmployeeId: targetUserId,
          status: "PENDING",
          reason: "Assignation express — Remplacement Express",
          resolvedByAgent: false,
        },
      });
    });

    revalidateReplacementPaths();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cnesstMatch = message.match(/CNESST:[^\n"]*/);
    if (cnesstMatch) return { ok: false, error: cnesstMatch[0] };
    return { ok: false, error: "database_error" };
  }
}

/** Notification ciblée dans le canal de station — sans assigner le quart. */
export async function notifyReplacementCandidateAction(
  shiftId: string,
  targetUserId: string,
  lang: Locale,
): Promise<ReplacementActionResult> {
  try {
    const access = await requireManagerForShift(shiftId);
    if (!access.ok) return { ok: false, error: access.error };

    const { user, shift } = access;

    const [target, channel] = await Promise.all([
      prisma.user.findUnique({ where: { id: targetUserId }, select: { fullName: true } }),
      prisma.chatChannel.findFirst({
        where: { locationId: shift.locationId, stationId: shift.stationId, type: "STATION" },
        select: { id: true },
      }),
    ]);

    if (!target) return { ok: false, error: "candidate_not_found" };
    if (!channel) return { ok: false, error: "channel_not_found" };

    const managerMember = await prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId: channel.id, userId: user.id } },
    });
    if (!managerMember?.canPost) return { ok: false, error: "unauthorized" };

    const timeLabel = formatTimeRange(shift.startsAt, shift.endsAt, lang);
    const dateLabel = new Intl.DateTimeFormat(lang, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Toronto",
    }).format(shift.startsAt);

    const body = `📢 ${target.fullName} — Le gérant a besoin d'un remplaçant ${shift.station.nameFr} le ${dateLabel} (${timeLabel}). Peux-tu couvrir ce quart? Réponds ici.`;

    await prisma.chatMessage.create({
      data: {
        channelId: channel.id,
        authorId: user.id,
        contentType: "TEXT",
        body,
        metadata: { source: "replacement_express", shiftId, targetUserId },
      },
    });

    revalidatePath(`/${lang}/messages/${channel.id}`);
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("replacement", error);
  }
}
