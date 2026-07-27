"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormationAudience } from "@/generated/prisma/enums";
import { canManageTrainingCatalog, getSessionUser } from "@/lib/auth/session";
import {
  canEditCatalogCategory,
  canEditCatalogModule,
} from "@/lib/data/training-catalog";
import { parseVideoUrl } from "@/lib/training/video";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type CatalogActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type CatalogCreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const SOPS_PATH = "/[lang]/sops";
const CATALOG_PATH = "/[lang]/settings/training";
const PUNCH_PATH = "/[lang]/pointeuse";

function revalidateCatalogPaths() {
  revalidatePath(SOPS_PATH, "page");
  revalidatePath(`${SOPS_PATH}/[moduleId]`, "page");
  revalidatePath(CATALOG_PATH, "page");
  revalidatePath(PUNCH_PATH, "page");
}

/**
 * Résout le périmètre d'écriture de l'auteur (succursale + organisation).
 * Toute action passe par ici — jamais de `locationId` venu du client.
 */
async function requireAuthor() {
  const user = await getSessionUser();
  if (!user || !canManageTrainingCatalog(user.role)) return null;

  const membership = await prisma.locationMember.findFirst({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: { select: { id: true, organizationId: true } } },
  });
  if (!membership) return null;

  return {
    userId: user.id,
    locationId: membership.location.id,
    organizationId: membership.location.organizationId,
  };
}

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  nameFr: z.string().trim().min(2).max(60),
  nameEn: z.string().trim().min(2).max(60),
  nameEs: z.string().trim().min(2).max(60),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "invalid_color"),
  icon: z.string().trim().max(40).nullable().optional(),
});

export async function upsertTrainingCategoryAction(
  input: z.input<typeof categorySchema>,
): Promise<CatalogCreateResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const { id, ...fields } = parsed.data;
    const payload = { ...fields, icon: fields.icon ?? null };

    if (id) {
      const allowed = await canEditCatalogCategory(id, author.locationId, author.organizationId);
      if (!allowed) return { ok: false, error: "unauthorized" };
      await prisma.trainingCategory.update({ where: { id }, data: payload });
      revalidateCatalogPaths();
      return { ok: true, id };
    }

    const lastCategory = await prisma.trainingCategory.findFirst({
      where: { locationId: author.locationId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const created = await prisma.trainingCategory.create({
      data: {
        ...payload,
        locationId: author.locationId,
        organizationId: author.organizationId,
        sortOrder: (lastCategory?.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });

    revalidateCatalogPaths();
    return { ok: true, id: created.id };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}

/**
 * Archive un rayon. Les modules qu'il contenait deviennent « non classés »
 * plutôt que d'être supprimés — on ne perd jamais du contenu de formation.
 */
export async function archiveTrainingCategoryAction(
  categoryId: string,
): Promise<CatalogActionResult> {
  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const allowed = await canEditCatalogCategory(
      categoryId,
      author.locationId,
      author.organizationId,
    );
    if (!allowed) return { ok: false, error: "unauthorized" };

    await prisma.$transaction([
      prisma.formationModule.updateMany({
        where: { categoryId },
        data: { categoryId: null },
      }),
      prisma.trainingCategory.update({
        where: { id: categoryId },
        data: { isActive: false },
      }),
    ]);

    revalidateCatalogPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}

export async function reorderTrainingCategoriesAction(
  orderedIds: string[],
): Promise<CatalogActionResult> {
  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const owned = await prisma.trainingCategory.findMany({
      where: {
        id: { in: orderedIds },
        OR: [
          { locationId: author.locationId },
          { locationId: null, organizationId: author.organizationId },
        ],
      },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((category) => category.id));
    if (ownedIds.size !== orderedIds.length) return { ok: false, error: "unauthorized" };

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.trainingCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    revalidateCatalogPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}

const stepSchema = z.object({
  order: z.number().int(),
  title: z.string().trim().max(160),
  body: z.string().trim().max(4000),
});

const moduleSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3, "invalid_title").max(160),
  summary: z.string().trim().max(500).default(""),
  body: z.string().trim().min(10, "invalid_body"),
  steps: z.array(stepSchema).max(40).default([]),
  kind: z.enum(["SOP", "SAFETY", "RECIPE", "ONBOARDING"]),
  categoryId: z.string().uuid().nullable().default(null),
  stationId: z.string().uuid().nullable().default(null),
  isMandatory: z.boolean().default(true),
  requiresSignature: z.boolean().default(true),
  estimatedMinutes: z.number().int().min(1, "invalid_duration").max(180, "invalid_duration"),
  videoUrl: z.string().trim().default(""),
  unlockDay: z.number().int().min(0).max(30).default(0),
});

function normalizeSteps(steps: z.output<typeof stepSchema>[]) {
  return steps
    .filter((step) => step.title.length > 0 || step.body.length > 0)
    .map((step, index) => ({ order: index + 1, title: step.title, body: step.body }));
}

export async function upsertTrainingModuleAction(
  input: z.input<typeof moduleSchema>,
): Promise<CatalogCreateResult> {
  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const data = parsed.data;

    if (data.videoUrl && !parseVideoUrl(data.videoUrl)) {
      return { ok: false, error: "invalid_video_url" };
    }

    if (data.categoryId) {
      const allowed = await canEditCatalogCategory(
        data.categoryId,
        author.locationId,
        author.organizationId,
      );
      if (!allowed) return { ok: false, error: "invalid_category" };
    }

    const payload = {
      kind: data.kind,
      title: data.title,
      summary: data.summary || null,
      body: data.body,
      steps: normalizeSteps(data.steps),
      categoryId: data.categoryId,
      // L'intégration est transversale par nature — jamais rattachée à un poste.
      stationId: data.kind === "ONBOARDING" ? null : data.stationId,
      isMandatory: data.isMandatory,
      requiresSignature: data.requiresSignature,
      estimatedMinutes: data.estimatedMinutes,
      videoUrl: data.videoUrl || null,
      unlockDay: data.unlockDay,
      organizationId: author.organizationId,
      locationId: author.locationId,
    };

    if (data.id) {
      const allowed = await canEditCatalogModule(
        data.id,
        author.locationId,
        author.organizationId,
      );
      if (!allowed) return { ok: false, error: "unauthorized" };
      await prisma.formationModule.update({ where: { id: data.id }, data: payload });
      revalidateCatalogPaths();
      return { ok: true, id: data.id };
    }

    const lastModule = await prisma.formationModule.findFirst({
      where: { locationId: author.locationId, categoryId: data.categoryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    // Un nouveau module démarre non publié : on l'assigne et on le relit
    // avant qu'il n'apparaisse dans le parcours des employés.
    const created = await prisma.formationModule.create({
      data: {
        ...payload,
        sortOrder: (lastModule?.sortOrder ?? -1) + 1,
        isActive: false,
      },
      select: { id: true },
    });

    revalidateCatalogPaths();
    return { ok: true, id: created.id };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}

export async function setModulePublishedAction(
  moduleId: string,
  isActive: boolean,
): Promise<CatalogActionResult> {
  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const allowed = await canEditCatalogModule(
      moduleId,
      author.locationId,
      author.organizationId,
    );
    if (!allowed) return { ok: false, error: "unauthorized" };

    if (isActive) {
      const assignmentCount = await prisma.formationAssignment.count({ where: { moduleId } });
      if (assignmentCount === 0) return { ok: false, error: "no_audience" };
    }

    await prisma.formationModule.update({ where: { id: moduleId }, data: { isActive } });
    revalidateCatalogPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}

/**
 * Supprime définitivement un module. Refusé dès qu'une attestation existe :
 * une signature CNESST est une preuve légale, elle ne disparaît pas d'un clic.
 * Dans ce cas l'auteur dépublie plutôt que de supprimer.
 */
export async function deleteTrainingModuleAction(
  moduleId: string,
): Promise<CatalogActionResult> {
  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const allowed = await canEditCatalogModule(
      moduleId,
      author.locationId,
      author.organizationId,
    );
    if (!allowed) return { ok: false, error: "unauthorized" };

    const signedCount = await prisma.employeeFormationProgress.count({
      where: { moduleId, status: "COMPLETED" },
    });
    if (signedCount > 0) return { ok: false, error: "has_attestations" };

    await prisma.formationModule.delete({ where: { id: moduleId } });
    revalidateCatalogPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}

const reorderSchema = z
  .array(
    z.object({
      moduleId: z.string().uuid(),
      categoryId: z.string().uuid().nullable(),
      sortOrder: z.number().int().min(0),
    }),
  )
  .max(400);

/** Persiste un glisser-déposer : nouvelle position et éventuel changement de rayon. */
export async function reorderTrainingModulesAction(
  input: z.input<typeof reorderSchema>,
): Promise<CatalogActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const moves = parsed.data;
    const owned = await prisma.formationModule.findMany({
      where: {
        id: { in: moves.map((move) => move.moduleId) },
        OR: [
          { locationId: author.locationId },
          { locationId: null, organizationId: author.organizationId },
        ],
      },
      select: { id: true },
    });
    if (owned.length !== moves.length) return { ok: false, error: "unauthorized" };

    const categoryIds = [
      ...new Set(moves.map((move) => move.categoryId).filter((id): id is string => id !== null)),
    ];
    if (categoryIds.length > 0) {
      const validCategories = await prisma.trainingCategory.count({
        where: {
          id: { in: categoryIds },
          OR: [
            { locationId: author.locationId },
            { locationId: null, organizationId: author.organizationId },
          ],
        },
      });
      if (validCategories !== categoryIds.length) return { ok: false, error: "invalid_category" };
    }

    await prisma.$transaction(
      moves.map((move) =>
        prisma.formationModule.update({
          where: { id: move.moduleId },
          data: { categoryId: move.categoryId, sortOrder: move.sortOrder },
        }),
      ),
    );

    revalidateCatalogPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}

const assignmentSchema = z.object({
  moduleId: z.string().uuid(),
  everyone: z.boolean().default(false),
  roles: z
    .array(
      z.enum([
        "EMPLOYEE",
        "MANAGER",
        "OWNER",
        "ADMIN",
        "INSTRUCTOR",
        "FRONT_DESK",
        "STUDENT",
      ]),
    )
    .default([]),
  stationIds: z.array(z.string().uuid()).default([]),
  userIds: z.array(z.string().uuid()).default([]),
  /** ISO date (yyyy-mm-dd) ou `null` — appliquée à toutes les règles du module. */
  dueAt: z.string().trim().nullable().default(null),
});

/**
 * Remplace l'intégralité des règles d'un module. « Tout le monde » écrase les
 * autres cibles : cumuler EVERYONE avec un rôle n'aurait aucun effet et
 * rendrait le tiroir mensonger.
 */
export async function setModuleAssignmentsAction(
  input: z.input<typeof assignmentSchema>,
): Promise<CatalogActionResult> {
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  try {
    const author = await requireAuthor();
    if (!author) return { ok: false, error: "unauthorized" };

    const { moduleId, everyone, roles, stationIds, userIds, dueAt } = parsed.data;

    const allowed = await canEditCatalogModule(
      moduleId,
      author.locationId,
      author.organizationId,
    );
    if (!allowed) return { ok: false, error: "unauthorized" };

    let due: Date | null = null;
    if (dueAt) {
      const parsedDate = new Date(dueAt);
      if (Number.isNaN(parsedDate.getTime())) return { ok: false, error: "invalid_due_date" };
      due = parsedDate;
    }

    const rules: {
      audience: FormationAudience;
      role?:
        | "EMPLOYEE"
        | "MANAGER"
        | "OWNER"
        | "ADMIN"
        | "INSTRUCTOR"
        | "FRONT_DESK"
        | "STUDENT";
      stationId?: string;
      userId?: string;
    }[] = everyone
      ? [{ audience: "EVERYONE" }]
      : [
          ...roles.map((role) => ({ audience: "ROLE" as const, role })),
          ...stationIds.map((stationId) => ({ audience: "STATION" as const, stationId })),
          ...userIds.map((userId) => ({ audience: "USER" as const, userId })),
        ];

    if (!everyone && rules.length > 0) {
      const [validStations, validUsers] = await Promise.all([
        stationIds.length > 0
          ? prisma.station.count({
              where: { id: { in: stationIds }, locationId: author.locationId },
            })
          : Promise.resolve(0),
        userIds.length > 0
          ? prisma.locationMember.count({
              where: { userId: { in: userIds }, locationId: author.locationId },
            })
          : Promise.resolve(0),
      ]);
      if (validStations !== stationIds.length) return { ok: false, error: "invalid_station" };
      if (validUsers !== userIds.length) return { ok: false, error: "invalid_employee" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.formationAssignment.deleteMany({ where: { moduleId } });
      if (rules.length === 0) {
        // Plus aucun public : on dépublie pour éviter un module orphelin actif.
        await tx.formationModule.update({
          where: { id: moduleId },
          data: { isActive: false },
        });
        return;
      }
      await tx.formationAssignment.createMany({
        data: rules.map((rule) => ({
          ...rule,
          moduleId,
          dueAt: due,
          assignedById: author.userId,
        })),
      });
    });

    revalidateCatalogPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("training-catalog", error);
  }
}
