"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import {
  findAvailableReplacementsForShift,
  type RejectionReason,
} from "@/lib/agents/find-available-replacements";
import { getAgentPlaybookSettings } from "@/lib/rsi/playbooks";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { formatTimeRange } from "@/lib/calendar/format";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";

const CODE_RED_WINDOW_HOURS = 4;
const PATHS = [
  "/[lang]/calendar/manager/schedule",
  "/[lang]/calendar/week",
  "/[lang]/calendar/day",
  "/[lang]/calendar/mobile",
  "/[lang]/pointeuse",
] as const;

export type CodeRedOffer = {
  bidId: string;
  shiftId: string;
  stationId: string;
  stationNameFr: string;
  stationNameEn: string;
  stationNameEs: string;
  stationColorHex: string;
  startsAt: string;
  endsAt: string;
  surgeBonus: number | null;
  codeRedAt: string | null;
};

export type TriggerCodeRedResult =
  | {
      ok: true;
      shiftId: string;
      candidatesContacted: number;
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

export type AcceptCodeRedResult =
  | { ok: true; shiftId: string }
  | { ok: false; error: string };

function revalidateCodeRedPaths() {
  for (const path of PATHS) revalidatePath(path, "page");
}

function hoursUntil(startsAt: Date): number {
  return (startsAt.getTime() - Date.now()) / (1000 * 60 * 60);
}

/**
 * Active le Code Rouge : CRISIS_ALERT + urgency CODE_RED + cascade d'offres
 * aux employés filtrés (formation, dispos, CNESST 40h/32h). Premier clic gagne.
 */
export async function triggerCodeRedAction(input: {
  shiftId: string;
  surgeBonus?: number | null;
  lang: Locale;
  /** Élargit le balayage aux polyvalents d'autres stations. */
  allowCrossStation?: boolean;
}): Promise<TriggerCodeRedResult> {
  try {
    const manager = await getSessionUser();
    if (!manager || !canAccessManagerSettings(manager.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const shift = await prisma.shift.findUnique({
      where: { id: input.shiftId },
      include: {
        station: true,
        employee: { select: { id: true, fullName: true } },
      },
    });
    if (!shift) return { ok: false, error: "shift_not_found" };

    const membership = await prisma.locationMember.findFirst({
      where: { userId: manager.id, locationId: shift.locationId },
    });
    if (!membership) return { ok: false, error: "unauthorized" };

    if (shift.urgency === "CODE_RED") {
      return { ok: false, error: "already_code_red" };
    }

    const hoursLeft = hoursUntil(shift.startsAt);
    if (hoursLeft > CODE_RED_WINDOW_HOURS) {
      return { ok: false, error: "not_urgent_enough" };
    }
    if (hoursLeft < -1) {
      return { ok: false, error: "shift_already_started" };
    }

    const surgeSettings = await getAgentPlaybookSettings(shift.locationId, "CODE_RED_SURGE");
    const surge =
      input.surgeBonus != null && Number.isFinite(input.surgeBonus) && input.surgeBonus > 0
        ? Math.round(input.surgeBonus * 100) / 100
        : surgeSettings.defaultSurgeBonus > 0
          ? surgeSettings.defaultSurgeBonus
          : null;

    const allowCross = input.allowCrossStation ?? true;
    const scan = await findAvailableReplacementsForShift(shift, {
      allowCrossStation: allowCross,
      preferSameStationFirst: true,
    });

    if (scan.candidates.length === 0) {
      return { ok: false, error: "no_eligible_candidates" };
    }

    const now = new Date();
    const noteLine = `[CODE ROUGE ${now.toISOString()}${surge != null ? ` · +${surge}$/h` : ""}]`;

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id: shift.id },
        data: {
          status: "CRISIS_ALERT",
          urgency: "CODE_RED",
          surgeBonus: surge,
          codeRedAt: now,
          codeRedById: manager.id,
          employeeId: null,
          notes: shift.notes ? `${shift.notes}\n${noteLine}` : noteLine,
        },
      });

      // Expire toute offre précédente (re-trigger).
      await tx.emergencyBid.updateMany({
        where: { shiftId: shift.id, status: "PENDING" },
        data: { status: "EXPIRED", respondedAt: now },
      });

      await tx.emergencyBid.createMany({
        data: scan.candidates.map((c) => ({
          shiftId: shift.id,
          userId: c.userId,
          status: "PENDING" as const,
          notifiedAt: now,
        })),
        skipDuplicates: true,
      });
    });

    // Notification canal station — liquidité interne (push natif à brancher plus tard).
    const channel = await prisma.chatChannel.findFirst({
      where: {
        locationId: shift.locationId,
        stationId: shift.stationId,
        type: "STATION",
      },
      select: { id: true },
    });

    if (channel) {
      const timeLabel = formatTimeRange(shift.startsAt, shift.endsAt, input.lang);
      const stationName = stationLabel(shift.station, input.lang);
      const bonusLabel =
        surge != null
          ? input.lang === "en"
            ? ` · +$${surge}/hr surge`
            : input.lang === "es"
              ? ` · +$${surge}/h prima`
              : ` · +${surge} $/h de prime`
          : "";
      const body =
        input.lang === "en"
          ? `🚨 CODE RED — ${stationName} shift open (${timeLabel})${bonusLabel}. First qualified teammate to claim it in Mirok wins.`
          : input.lang === "es"
            ? `🚨 CÓDIGO ROJO — Turno ${stationName} abierto (${timeLabel})${bonusLabel}. El primero en reclamarlo en Mirok se lo queda.`
            : `🚨 CODE ROUGE — Quart ${stationName} ouvert (${timeLabel})${bonusLabel}. Premier équipier qualifié qui clique dans Mirok gagne le quart.`;

      await prisma.chatMessage.create({
        data: {
          channelId: channel.id,
          authorId: manager.id,
          contentType: "AGENT",
          body,
          metadata: {
            source: "code_red",
            shiftId: shift.id,
            candidateCount: scan.candidates.length,
            surgeBonus: surge,
          },
        },
      });
    }

    revalidateCodeRedPaths();

    return {
      ok: true,
      shiftId: shift.id,
      candidatesContacted: scan.candidates.length,
      candidates: scan.candidates.map((c) => ({
        userId: c.userId,
        fullName: c.fullName,
        profilePictureUrl: c.profilePictureUrl,
      })),
      rejections: scan.rejections,
      scanned: scan.scanned,
    };
  } catch (error) {
    return actionDatabaseError("code-red", error);
  }
}

/**
 * Premier arrivé, premier servi — claim atomique du Code Rouge.
 * Les autres offres PENDING passent à MISSED.
 */
export async function acceptCodeRedShiftAction(shiftId: string): Promise<AcceptCodeRedResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        urgency: true,
        status: true,
        employeeId: true,
        locationId: true,
        stationId: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!shift) return { ok: false, error: "shift_not_found" };
    if (shift.urgency !== "CODE_RED") return { ok: false, error: "not_code_red" };
    if (shift.employeeId) return { ok: false, error: "already_taken" };

    const bid = await prisma.emergencyBid.findUnique({
      where: { shiftId_userId: { shiftId, userId: user.id } },
    });
    if (!bid || bid.status !== "PENDING") return { ok: false, error: "no_pending_bid" };

    // Re-vérifie l'éligibilité au moment du clic (heures / conflit / formation).
    const fullShift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
    const scan = await findAvailableReplacementsForShift(fullShift, {
      allowCrossStation: true,
      preferSameStationFirst: true,
    });
    if (!scan.candidates.some((c) => c.userId === user.id)) {
      return { ok: false, error: "no_longer_eligible" };
    }

    const now = new Date();

    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.shift.updateMany({
          where: {
            id: shiftId,
            urgency: "CODE_RED",
            employeeId: null,
          },
          data: {
            employeeId: user.id,
            status: "CONFIRMED",
            urgency: "NORMAL",
          },
        });
        if (claimed.count !== 1) {
          throw new Error("ALREADY_TAKEN");
        }

        await tx.emergencyBid.update({
          where: { id: bid.id },
          data: { status: "ACCEPTED", respondedAt: now },
        });

        await tx.emergencyBid.updateMany({
          where: {
            shiftId,
            status: "PENDING",
            userId: { not: user.id },
          },
          data: { status: "MISSED", respondedAt: now },
        });

        await tx.shiftSwapRequest.create({
          data: {
            shiftId,
            requestedById: user.id,
            targetEmployeeId: user.id,
            status: "ACCEPTED",
            reason: "Code Rouge — claim flash",
            resolvedByAgent: false,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ALREADY_TAKEN") {
        return { ok: false, error: "already_taken" };
      }
      const message = error instanceof Error ? error.message : String(error);
      const cnesstMatch = message.match(/CNESST:[^\n"]*/);
      if (cnesstMatch) return { ok: false, error: cnesstMatch[0] };
      throw error;
    }

    revalidateCodeRedPaths();
    return { ok: true, shiftId };
  } catch (error) {
    return actionDatabaseError("code-red", error);
  }
}

export async function declineCodeRedShiftAction(shiftId: string): Promise<AcceptCodeRedResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const bid = await prisma.emergencyBid.findUnique({
      where: { shiftId_userId: { shiftId, userId: user.id } },
    });
    if (!bid || bid.status !== "PENDING") return { ok: false, error: "no_pending_bid" };

    await prisma.emergencyBid.update({
      where: { id: bid.id },
      data: { status: "DECLINED", respondedAt: new Date() },
    });

    revalidateCodeRedPaths();
    return { ok: true, shiftId };
  } catch (error) {
    return actionDatabaseError("code-red", error);
  }
}
