import "server-only";

import type {
  FormationAudience,
  FormationModuleKind,
  Role,
} from "@/generated/prisma/enums";
import { canManageTrainingCatalog } from "@/lib/auth/session";
import { getStationsForLocation } from "@/lib/data/stations";
import type { StationRecord } from "@/lib/stations/display";
import { prisma } from "@/lib/prisma";
import { parseFormationSteps, type FormationStep } from "@/lib/training/types";

/** Une règle d'affectation telle qu'éditée dans le tiroir « Qui suit ce cours ». */
export type AssignmentRule = {
  id: string;
  audience: FormationAudience;
  role: Role | null;
  stationId: string | null;
  userId: string | null;
  dueAt: string | null;
};

export type CatalogModuleRow = {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  steps: FormationStep[];
  kind: FormationModuleKind;
  categoryId: string | null;
  stationId: string | null;
  isMandatory: boolean;
  requiresSignature: boolean;
  estimatedMinutes: number | null;
  videoUrl: string | null;
  unlockDay: number;
  sortOrder: number;
  isActive: boolean;
  assignments: AssignmentRule[];
  /** Nombre d'employés visés par l'union des règles, sur cette succursale. */
  assignedCount: number;
  completedCount: number;
  updatedAt: string;
};

export type CatalogCategoryRow = {
  id: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  icon: string | null;
  sortOrder: number;
  /** `true` = créée pour cette succursale, `false` = héritée du corporatif. */
  isLocal: boolean;
};

export type CatalogEmployeeRow = {
  userId: string;
  fullName: string;
  role: Role;
  stationId: string | null;
  profilePictureUrl: string | null;
};

export type TrainingCatalogAdmin = {
  locationId: string;
  locationName: string;
  organizationId: string;
  stations: StationRecord[];
  categories: CatalogCategoryRow[];
  modules: CatalogModuleRow[];
  employees: CatalogEmployeeRow[];
};

async function getAuthoringLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
}

/**
 * Résout, pour chaque module, le nombre d'employés réellement visés.
 * L'union des règles est calculée en mémoire : le nombre d'employés par
 * succursale est petit (dizaines), et cela évite N requêtes SQL.
 */
function countAssignedEmployees(
  rules: AssignmentRule[],
  employees: CatalogEmployeeRow[],
): Set<string> {
  const matched = new Set<string>();
  for (const rule of rules) {
    for (const employee of employees) {
      if (matched.has(employee.userId)) continue;
      const hit =
        (rule.audience === "EVERYONE") ||
        (rule.audience === "ROLE" && rule.role === employee.role) ||
        (rule.audience === "STATION" && rule.stationId === employee.stationId) ||
        (rule.audience === "USER" && rule.userId === employee.userId);
      if (hit) matched.add(employee.userId);
    }
  }
  return matched;
}

export async function getTrainingCatalogAdmin(userId: string, userRole: Role) {
  if (!canManageTrainingCatalog(userRole)) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const membership = await getAuthoringLocation(userId);
  if (!membership) return { ok: false as const, error: "unauthorized" as const };

  const { locationId, location } = membership;
  const organizationId = location.organizationId;
  const scopeFilter = { OR: [{ locationId }, { locationId: null, organizationId }] };

  const [stations, categories, modules, members] = await Promise.all([
    getStationsForLocation(locationId),
    prisma.trainingCategory.findMany({
      where: { isActive: true, ...scopeFilter },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
    prisma.formationModule.findMany({
      where: scopeFilter,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      include: { assignments: true },
    }),
    prisma.locationMember.findMany({
      where: { locationId },
      include: { user: { select: { id: true, fullName: true, role: true, profilePictureUrl: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
  ]);

  const employees: CatalogEmployeeRow[] = members.map((member) => ({
    userId: member.user.id,
    fullName: member.user.fullName,
    role: member.user.role,
    stationId: member.stationId,
    profilePictureUrl: member.user.profilePictureUrl,
  }));

  const progressRows = await prisma.employeeFormationProgress.findMany({
    where: {
      status: "COMPLETED",
      moduleId: { in: modules.map((m) => m.id) },
      userId: { in: employees.map((e) => e.userId) },
    },
    select: { moduleId: true, userId: true },
  });

  const completedByModule = new Map<string, Set<string>>();
  for (const row of progressRows) {
    const bucket = completedByModule.get(row.moduleId) ?? new Set<string>();
    bucket.add(row.userId);
    completedByModule.set(row.moduleId, bucket);
  }

  const moduleRows: CatalogModuleRow[] = modules.map((formationModule) => {
    const assignments: AssignmentRule[] = formationModule.assignments.map((rule) => ({
      id: rule.id,
      audience: rule.audience,
      role: rule.role,
      stationId: rule.stationId,
      userId: rule.userId,
      dueAt: rule.dueAt?.toISOString() ?? null,
    }));

    const assignedIds = countAssignedEmployees(assignments, employees);
    const completedIds = completedByModule.get(formationModule.id) ?? new Set<string>();

    return {
      id: formationModule.id,
      title: formationModule.title,
      summary: formationModule.summary,
      body: formationModule.body,
      steps: parseFormationSteps(formationModule.steps),
      kind: formationModule.kind,
      categoryId: formationModule.categoryId,
      stationId: formationModule.stationId,
      isMandatory: formationModule.isMandatory,
      requiresSignature: formationModule.requiresSignature,
      estimatedMinutes: formationModule.estimatedMinutes,
      videoUrl: formationModule.videoUrl,
      unlockDay: formationModule.unlockDay,
      sortOrder: formationModule.sortOrder,
      isActive: formationModule.isActive,
      assignments,
      assignedCount: assignedIds.size,
      completedCount: [...completedIds].filter((id) => assignedIds.has(id)).length,
      updatedAt: formationModule.updatedAt.toISOString(),
    };
  });

  return {
    ok: true as const,
    data: {
      locationId,
      locationName: location.name,
      organizationId,
      stations,
      categories: categories.map((category) => ({
        id: category.id,
        nameFr: category.nameFr,
        nameEn: category.nameEn,
        nameEs: category.nameEs,
        colorHex: category.colorHex,
        icon: category.icon,
        sortOrder: category.sortOrder,
        isLocal: category.locationId === locationId,
      })),
      modules: moduleRows,
      employees,
    } satisfies TrainingCatalogAdmin,
  };
}

/** Garde-fou d'écriture : le module appartient-il au périmètre de l'auteur ? */
export async function canEditCatalogModule(
  moduleId: string,
  locationId: string,
  organizationId: string,
) {
  const formationModule = await prisma.formationModule.findUnique({
    where: { id: moduleId },
    select: { locationId: true, organizationId: true },
  });
  if (!formationModule) return false;
  if (formationModule.locationId) return formationModule.locationId === locationId;
  return formationModule.organizationId === organizationId || formationModule.organizationId === null;
}

export async function canEditCatalogCategory(
  categoryId: string,
  locationId: string,
  organizationId: string,
) {
  const category = await prisma.trainingCategory.findUnique({
    where: { id: categoryId },
    select: { locationId: true, organizationId: true },
  });
  if (!category) return false;
  if (category.locationId) return category.locationId === locationId;
  return category.organizationId === organizationId;
}
