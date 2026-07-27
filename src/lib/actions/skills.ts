"use server";

import { revalidatePath } from "next/cache";
import type { SkillLevel } from "@/generated/prisma/enums";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { SKILL_LEVELS } from "@/lib/skills/levels";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type SkillsActionResult = { ok: true } | { ok: false; error: string };

const SKILLS_PATH = "/[lang]/settings/manager/skills";
const WEEK_PATH = "/[lang]/calendar/week";
const SCHEDULE_PATH = "/[lang]/calendar/manager/schedule";
const MOBILE_PATH = "/[lang]/calendar/mobile";
const SOPS_PATH = "/[lang]/sops";

function revalidateSkillsPaths() {
  revalidatePath(SKILLS_PATH, "page");
  revalidatePath(WEEK_PATH, "page");
  revalidatePath(SCHEDULE_PATH, "page");
  revalidatePath(MOBILE_PATH, "page");
  revalidatePath(SOPS_PATH, "page");
  revalidatePath("/[lang]/settings/manager", "page");
}

export async function upsertStationSkillAction(input: {
  locationId: string;
  userId: string;
  stationId: string;
  level: SkillLevel;
  notes?: string;
}): Promise<SkillsActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }

    if (!SKILL_LEVELS.includes(input.level)) {
      return { ok: false, error: "invalid_level" };
    }

    const membership = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: input.locationId, userId: sessionUser.id },
      },
    });
    if (!membership && sessionUser.role !== "ADMIN") {
      return { ok: false, error: "unauthorized" };
    }

    const target = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: input.locationId, userId: input.userId },
      },
    });
    if (!target) return { ok: false, error: "member_not_found" };

    await prisma.employeeStationSkill.upsert({
      where: {
        locationId_userId_stationId: {
          locationId: input.locationId,
          userId: input.userId,
          stationId: input.stationId,
        },
      },
      create: {
        locationId: input.locationId,
        userId: input.userId,
        stationId: input.stationId,
        level: input.level,
        notes: input.notes?.trim().slice(0, 280) || null,
        assessedById: sessionUser.id,
        assessedAt: new Date(),
      },
      update: {
        level: input.level,
        notes: input.notes?.trim().slice(0, 280) || null,
        assessedById: sessionUser.id,
        assessedAt: new Date(),
      },
    });

    revalidateSkillsPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("skills", error);
  }
}

/** Initialise JUNIOR sur la station principale si aucune compétence n'existe encore. */
export async function ensurePrimaryStationSkill(input: {
  locationId: string;
  userId: string;
  stationId: string;
}): Promise<void> {
  try {
    await prisma.employeeStationSkill.upsert({
      where: {
        locationId_userId_stationId: {
          locationId: input.locationId,
          userId: input.userId,
          stationId: input.stationId,
        },
      },
      create: {
        locationId: input.locationId,
        userId: input.userId,
        stationId: input.stationId,
        level: "JUNIOR",
      },
      update: {},
    });
  } catch {
    // Non bloquant
  }
}
