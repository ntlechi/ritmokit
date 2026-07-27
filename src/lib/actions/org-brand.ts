"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type BrandSettingsResult = { ok: true } | { ok: false; error: string };

async function resolveManagerOrg(userId: string) {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true, location: { select: { organizationId: true } } },
  });
  return membership;
}

export async function updateOrgBrandAction(input: {
  name?: string;
  primaryColor: string;
  welcomeCopy: string;
  logoUrl?: string;
}): Promise<BrandSettingsResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerOrg(user.id);
    if (!membership) return { ok: false, error: "not_found" };

    const color = input.primaryColor.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return { ok: false, error: "invalid_color" };
    }

    await prisma.organization.update({
      where: { id: membership.location.organizationId },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        primaryColor: color,
        welcomeCopy: input.welcomeCopy.trim() || null,
        logoUrl: input.logoUrl?.trim() || null,
      },
    });

    revalidatePath("/[lang]/settings/manager/brand", "page");
    revalidatePath("/[lang]/tablet", "page");
    revalidatePath("/[lang]/onboarding", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("org-brand", error);
  }
}

export async function updateModuleUnlockDaysAction(
  updates: { moduleId: string; unlockDay: number }[],
): Promise<BrandSettingsResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerOrg(user.id);
    if (!membership) return { ok: false, error: "not_found" };

    const orgId = membership.location.organizationId;
    const locationId = membership.locationId;

    for (const row of updates) {
      const unlockDay = Math.min(30, Math.max(0, Math.round(row.unlockDay)));
      const module = await prisma.formationModule.findFirst({
        where: {
          id: row.moduleId,
          kind: "ONBOARDING",
          OR: [
            { locationId },
            { locationId: null, organizationId: orgId },
          ],
        },
        select: { id: true },
      });
      if (!module) continue;
      await prisma.formationModule.update({
        where: { id: module.id },
        data: { unlockDay },
      });
    }

    revalidatePath("/[lang]/settings/manager/brand", "page");
    revalidatePath("/[lang]/onboarding", "page");
    revalidatePath("/[lang]/tablet", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("org-brand", error);
  }
}
