"use server";

import { revalidatePath } from "next/cache";
import type { BenefitType } from "@/generated/prisma/enums";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type BenefitsActionResult = { ok: true } | { ok: false; error: string };

const BENEFITS_PATH = "/[lang]/settings/manager/benefits";
const MOBILE_PATH = "/[lang]/calendar/mobile";
const CAREER_PATH = "/[lang]/settings";

const BENEFIT_TYPES: BenefitType[] = ["INSURANCE", "RETIREMENT", "PERK", "DOCUMENT"];

function revalidateBenefitsPaths() {
  revalidatePath(BENEFITS_PATH, "page");
  revalidatePath(MOBILE_PATH, "page");
  revalidatePath(CAREER_PATH, "page");
  revalidatePath("/[lang]/settings/manager", "page");
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

export async function upsertLocationBenefitAction(input: {
  id?: string;
  locationId: string;
  title: string;
  description: string;
  type: BenefitType;
  externalUrl?: string;
  isActive: boolean;
  sortOrder?: number;
}): Promise<BenefitsActionResult> {
  try {
    const auth = await assertManagerForLocation(input.locationId);
    if (!auth.ok) return auth;

    const title = input.title.trim();
    const description = input.description.trim();
    if (title.length < 2) return { ok: false, error: "invalid_title" };
    if (description.length < 2) return { ok: false, error: "invalid_description" };
    if (!BENEFIT_TYPES.includes(input.type)) return { ok: false, error: "invalid_type" };

    const externalUrl = input.externalUrl?.trim() || null;
    if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
      return { ok: false, error: "invalid_url" };
    }

    if (input.id) {
      const existing = await prisma.locationBenefit.findFirst({
        where: { id: input.id, locationId: input.locationId },
      });
      if (!existing) return { ok: false, error: "not_found" };

      await prisma.locationBenefit.update({
        where: { id: input.id },
        data: {
          title,
          description,
          type: input.type,
          externalUrl,
          isActive: input.isActive,
          sortOrder: input.sortOrder ?? existing.sortOrder,
        },
      });
    } else {
      const maxSort = await prisma.locationBenefit.aggregate({
        where: { locationId: input.locationId },
        _max: { sortOrder: true },
      });
      await prisma.locationBenefit.create({
        data: {
          locationId: input.locationId,
          title,
          description,
          type: input.type,
          externalUrl,
          isActive: input.isActive,
          sortOrder: input.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        },
      });
    }

    revalidateBenefitsPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("benefits", error);
  }
}

export async function toggleLocationBenefitAction(input: {
  id: string;
  locationId: string;
  isActive: boolean;
}): Promise<BenefitsActionResult> {
  try {
    const auth = await assertManagerForLocation(input.locationId);
    if (!auth.ok) return auth;

    const existing = await prisma.locationBenefit.findFirst({
      where: { id: input.id, locationId: input.locationId },
    });
    if (!existing) return { ok: false, error: "not_found" };

    await prisma.locationBenefit.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
    });

    revalidateBenefitsPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("benefits", error);
  }
}

export async function deleteLocationBenefitAction(input: {
  id: string;
  locationId: string;
}): Promise<BenefitsActionResult> {
  try {
    const auth = await assertManagerForLocation(input.locationId);
    if (!auth.ok) return auth;

    const existing = await prisma.locationBenefit.findFirst({
      where: { id: input.id, locationId: input.locationId },
    });
    if (!existing) return { ok: false, error: "not_found" };

    await prisma.locationBenefit.delete({ where: { id: input.id } });
    revalidateBenefitsPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("benefits", error);
  }
}
