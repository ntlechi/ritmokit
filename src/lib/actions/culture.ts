"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { BATI_CULTURE_CONSTITUTION } from "@/lib/culture/values";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type CultureActionResult = { ok: true } | { ok: false; error: string };

const CULTURE_PATH = "/[lang]/settings/manager/culture";
const MANAGER_PATH = "/[lang]/settings/manager";

/**
 * Initialise (ou met à jour) la Culture Constitution Bati pour une organisation.
 * Upsert idempotent — safe à relancer.
 */
export async function initializeBatiCultureConstitutionAction(
  organizationId?: string,
): Promise<CultureActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }

    let orgId = organizationId;
    if (!orgId) {
      const membership = await prisma.locationMember.findFirst({
        where: { userId: sessionUser.id },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { location: { select: { organizationId: true } } },
      });
      orgId = membership?.location.organizationId;
    }
    if (!orgId) return { ok: false, error: "organization_not_found" };

    if (sessionUser.role !== "ADMIN") {
      const membership = await prisma.locationMember.findFirst({
        where: {
          userId: sessionUser.id,
          location: { organizationId: orgId },
        },
      });
      if (!membership) return { ok: false, error: "unauthorized" };
    }

    await prisma.$transaction(
      BATI_CULTURE_CONSTITUTION.map((val) =>
        prisma.organizationValue.upsert({
          where: {
            organizationId_valueKey: {
              organizationId: orgId!,
              valueKey: val.valueKey,
            },
          },
          update: {
            titleFr: val.titleFr,
            titleEn: val.titleEn,
            titleEs: val.titleEs,
            behaviorFr: val.behaviorFr,
            behaviorEn: val.behaviorEn,
            behaviorEs: val.behaviorEs,
            sortOrder: val.sortOrder,
            isActive: true,
          },
          create: {
            organizationId: orgId!,
            valueKey: val.valueKey,
            titleFr: val.titleFr,
            titleEn: val.titleEn,
            titleEs: val.titleEs,
            behaviorFr: val.behaviorFr,
            behaviorEn: val.behaviorEn,
            behaviorEs: val.behaviorEs,
            sortOrder: val.sortOrder,
            isActive: true,
          },
        }),
      ),
    );

    revalidatePath(CULTURE_PATH, "page");
    revalidatePath(MANAGER_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("culture", error);
  }
}

export type UpdateOrganizationValueInput = {
  valueId: string;
  titleFr: string;
  titleEn: string;
  titleEs: string;
  behaviorFr: string;
  behaviorEn: string;
  behaviorEs: string;
};

/**
 * Met à jour une valeur de la constitution (titres + comportements FR/EN/ES).
 * Réservé MANAGER / OWNER / ADMIN de l'organisation.
 */
export async function updateOrganizationValueAction(
  input: UpdateOrganizationValueInput,
): Promise<CultureActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const titleFr = input.titleFr.trim();
    const titleEn = input.titleEn.trim();
    const titleEs = input.titleEs.trim();
    const behaviorFr = input.behaviorFr.trim();
    const behaviorEn = input.behaviorEn.trim();
    const behaviorEs = input.behaviorEs.trim();

    if (!titleFr || !titleEn || !titleEs || !behaviorFr || !behaviorEn || !behaviorEs) {
      return { ok: false, error: "missing_fields" };
    }

    const existing = await prisma.organizationValue.findUnique({
      where: { id: input.valueId },
      select: { id: true, organizationId: true },
    });
    if (!existing) return { ok: false, error: "value_not_found" };

    if (sessionUser.role !== "ADMIN") {
      const membership = await prisma.locationMember.findFirst({
        where: {
          userId: sessionUser.id,
          location: { organizationId: existing.organizationId },
        },
      });
      if (!membership) return { ok: false, error: "unauthorized" };
    }

    await prisma.organizationValue.update({
      where: { id: existing.id },
      data: {
        titleFr,
        titleEn,
        titleEs,
        behaviorFr,
        behaviorEn,
        behaviorEs,
      },
    });

    revalidatePath(CULTURE_PATH, "page");
    revalidatePath(MANAGER_PATH, "page");
    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("culture", error);
  }
}
