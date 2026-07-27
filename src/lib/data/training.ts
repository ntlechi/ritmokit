import type {
  FormationModuleKind,
  FormationProgressStatus,
  Role,
} from "@/generated/prisma/enums";
import { getStationsForLocation } from "@/lib/data/stations";
import {
  resolveSeniorityAnchor,
  seniorityDaysSince,
} from "@/lib/hr/onboarding";
import type { StationRecord } from "@/lib/stations/display";
import { prisma } from "@/lib/prisma";
import { parseFormationSteps } from "@/lib/training/types";

export type FormationModuleSummary = {
  id: string;
  title: string;
  summary: string | null;
  kind: FormationModuleKind;
  stationId: string | null;
  categoryId: string | null;
  isMandatory: boolean;
  requiresSignature: boolean;
  estimatedMinutes: number | null;
  videoUrl: string | null;
  stepCount: number;
  status: FormationProgressStatus;
  completedAt: string | null;
  unlockDay: number;
  unlocked: boolean;
  lockedLabel: string | null;
  /** `true` = affecté à cet employé. `false` = accessible en polyvalence. */
  assigned: boolean;
  /** Échéance de l'affectation la plus proche, si l'auteur en a fixé une. */
  dueAt: string | null;
};

/** Rayon du catalogue tel que présenté à l'employé. */
export type FormationCategoryRef = {
  id: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  icon: string | null;
};

/** Section pliable du hub SOP — un département (station) ou le tronc commun. */
export type FormationCatalogSection = {
  /** `null` = modules transversaux (onboarding, politiques générales). */
  stationId: string | null;
  modules: FormationModuleSummary[];
  completedCount: number;
  mandatoryRemaining: number;
};

export type FormationCatalog = {
  primaryStationId: string | null;
  stations: StationRecord[];
  categories: FormationCategoryRef[];
  sections: FormationCatalogSection[];
  /** Total lessons across all sections. */
  totalLessons: number;
  completedLessons: number;
  /** Civil J-day seniority (0 if hire anchor missing). */
  seniorityDays: number;
  /** Best module to resume — in progress, else first unlocked incomplete. */
  resumeModule: FormationModuleSummary | null;
};

export type FormationModuleDetail = FormationModuleSummary & {
  body: string;
  steps: ReturnType<typeof parseFormationSteps>;
  signatureName: string | null;
  signedAt: string | null;
  station: Pick<StationRecord, "nameFr" | "nameEn" | "nameEs"> | null;
  /** Sibling modules in the same track (section) for the playlist sidebar. */
  playlist: FormationModuleSummary[];
};

export type TrainingComplianceSnapshot = {
  stationId: string;
  station: Pick<StationRecord, "nameFr" | "nameEn" | "nameEs">;
  missingModules: { id: string; title: string }[];
  isCompliant: boolean;
};

async function resolvePrimaryStationId(userId: string, locationId?: string): Promise<string | null> {
  if (locationId) {
    const membership = await prisma.locationMember.findUnique({
      where: { locationId_userId: { locationId, userId } },
      select: { stationId: true },
    });
    if (membership) return membership.stationId;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId, isPrimary: true },
    select: { stationId: true },
  });
  return membership?.stationId ?? null;
}

async function resolveLocationContext(userId: string, locationId?: string) {
  if (locationId) {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, organizationId: true },
    });
    if (location) return location;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId, isPrimary: true },
    include: { location: { select: { id: true, organizationId: true } } },
  });
  return membership?.location ?? null;
}

async function resolveSeniority(userId: string, locationId: string) {
  const [hrProfile, membership] = await Promise.all([
    prisma.employeeHrProfile.findUnique({
      where: { userId },
      select: { integrationStartedAt: true },
    }),
    prisma.locationMember.findUnique({
      where: { locationId_userId: { locationId, userId } },
      select: { hiredAt: true },
    }),
  ]);

  const anchor = resolveSeniorityAnchor({
    integrationStartedAt: hrProfile?.integrationStartedAt,
    hiredAt: membership?.hiredAt,
    locationId,
  });

  if (!anchor.ok) {
    return { seniorityDays: 0, seniorityAnchorMissing: true };
  }

  return {
    seniorityDays: seniorityDaysSince(anchor.anchor, locationId),
    seniorityAnchorMissing: false,
  };
}

function lockedLabelFor(
  unlockDay: number,
  dayOk: boolean,
  seniorityAnchorMissing: boolean,
): string | null {
  if (dayOk) return null;
  if (seniorityAnchorMissing && unlockDay > 0) return "hire_anchor_required";
  return `unlock_day:${unlockDay}`;
}

function emptyCatalog(primaryStationId: string | null): FormationCatalog {
  return {
    primaryStationId,
    stations: [],
    categories: [],
    sections: [],
    totalLessons: 0,
    completedLessons: 0,
    seniorityDays: 0,
    resumeModule: null,
  };
}

type AssignmentRow = {
  audience: "EVERYONE" | "ROLE" | "STATION" | "USER";
  role: Role | null;
  stationId: string | null;
  userId: string | null;
  dueAt: Date | null;
};

type Viewer = { userId: string; role: Role; stationId: string | null };

/**
 * Un module est visible si une règle vise l'employé. Les modules rattachés à
 * un poste restent consultables par toute la succursale (polyvalence : « tout
 * le monde apprend un peu de tout ») ; ceux visant un rôle ou une personne
 * nommée restent privés à leur public.
 */
function resolveVisibility(rules: AssignmentRow[], viewer: Viewer) {
  let assigned = false;
  let browsable = false;
  let dueAt: Date | null = null;

  for (const rule of rules) {
    const matchesViewer =
      rule.audience === "EVERYONE" ||
      (rule.audience === "ROLE" && rule.role === viewer.role) ||
      (rule.audience === "STATION" && rule.stationId === viewer.stationId) ||
      (rule.audience === "USER" && rule.userId === viewer.userId);

    if (matchesViewer) {
      assigned = true;
      if (rule.dueAt && (!dueAt || rule.dueAt < dueAt)) dueAt = rule.dueAt;
    } else if (rule.audience === "STATION") {
      browsable = true;
    }
  }

  return { visible: assigned || browsable, assigned, dueAt };
}

export async function getFormationCatalogForUser(
  userId: string,
  locationId?: string,
): Promise<FormationCatalog> {
  const [primaryStationId, location] = await Promise.all([
    resolvePrimaryStationId(userId, locationId),
    resolveLocationContext(userId, locationId),
  ]);
  if (!location) return emptyCatalog(primaryStationId);

  const scopeFilter = {
    OR: [
      { locationId: location.id },
      { locationId: null, organizationId: location.organizationId },
      { locationId: null, organizationId: null },
    ],
  };

  const [{ seniorityDays, seniorityAnchorMissing }, stations, categories, modules, viewer] =
    await Promise.all([
      resolveSeniority(userId, location.id),
      getStationsForLocation(location.id),
      prisma.trainingCategory.findMany({
        where: { isActive: true, ...scopeFilter },
        orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
        select: {
          id: true,
          nameFr: true,
          nameEn: true,
          nameEs: true,
          colorHex: true,
          icon: true,
        },
      }),
      prisma.formationModule.findMany({
        where: { isActive: true, ...scopeFilter },
        orderBy: [{ unlockDay: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
        include: {
          assignments: {
            select: {
              audience: true,
              role: true,
              stationId: true,
              userId: true,
              dueAt: true,
            },
          },
        },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    ]);

  const progressRows = await prisma.employeeFormationProgress.findMany({
    where: { userId, moduleId: { in: modules.map((m) => m.id) } },
  });
  const progressByModule = new Map(progressRows.map((row) => [row.moduleId, row]));

  const viewerContext: Viewer = {
    userId,
    role: viewer?.role ?? "EMPLOYEE",
    stationId: primaryStationId,
  };

  const byStationId = new Map<string | null, FormationModuleSummary[]>();
  for (const formationModule of modules) {
    const visibility = resolveVisibility(formationModule.assignments, viewerContext);
    if (!visibility.visible) continue;

    const progress = progressByModule.get(formationModule.id);
    const steps = parseFormationSteps(formationModule.steps);
    const dayOk =
      formationModule.unlockDay <= 0 ||
      (!seniorityAnchorMissing && formationModule.unlockDay <= seniorityDays);
    const unlocked = dayOk;
    const summary: FormationModuleSummary = {
      id: formationModule.id,
      title: formationModule.title,
      summary: formationModule.summary,
      kind: formationModule.kind,
      stationId: formationModule.stationId,
      categoryId: formationModule.categoryId,
      isMandatory: formationModule.isMandatory,
      requiresSignature: formationModule.requiresSignature,
      estimatedMinutes: formationModule.estimatedMinutes,
      videoUrl: formationModule.videoUrl,
      stepCount: steps.length,
      status: progress?.status ?? "NOT_STARTED",
      completedAt: progress?.completedAt?.toISOString() ?? null,
      unlockDay: formationModule.unlockDay,
      unlocked,
      lockedLabel: lockedLabelFor(
        formationModule.unlockDay,
        dayOk,
        seniorityAnchorMissing,
      ),
      assigned: visibility.assigned,
      dueAt: visibility.dueAt?.toISOString() ?? null,
    };
    const bucket = byStationId.get(formationModule.stationId) ?? [];
    bucket.push(summary);
    byStationId.set(formationModule.stationId, bucket);
  }

  const orderedKeys: Array<string | null> = [
    null,
    ...(primaryStationId ? [primaryStationId] : []),
    ...stations.map((s) => s.id).filter((id) => id !== primaryStationId),
  ];

  const sections: FormationCatalogSection[] = orderedKeys
    .map((stationId) => {
      const sectionModules = byStationId.get(stationId) ?? [];
      return {
        stationId,
        modules: sectionModules,
        completedCount: sectionModules.filter((m) => m.status === "COMPLETED").length,
        mandatoryRemaining: sectionModules.filter(
          (m) => m.isMandatory && m.assigned && m.status !== "COMPLETED" && m.unlocked,
        ).length,
      };
    })
    .filter((section) => section.modules.length > 0);

  const allModules = sections.flatMap((s) => s.modules);
  const completedLessons = allModules.filter((m) => m.status === "COMPLETED").length;

  const pending = allModules.filter((m) => m.unlocked && m.status !== "COMPLETED");
  // Ce qui est dû passe devant, puis l'affecté, puis la polyvalence.
  const resumeModule =
    pending.find((m) => m.assigned && m.dueAt) ??
    pending.find((m) => m.assigned) ??
    pending[0] ??
    null;

  return {
    primaryStationId,
    stations,
    categories,
    sections,
    totalLessons: allModules.length,
    completedLessons,
    seniorityDays,
    resumeModule,
  };
}

export async function getFormationModuleForUser(
  userId: string,
  moduleId: string,
): Promise<FormationModuleDetail | null> {
  const formationModule = await prisma.formationModule.findUnique({
    where: { id: moduleId },
    include: { station: { select: { nameFr: true, nameEn: true, nameEs: true } } },
  });
  if (!formationModule || !formationModule.isActive) return null;

  const catalog = await getFormationCatalogForUser(userId);
  const section = catalog.sections.find((s) =>
    s.modules.some((m) => m.id === moduleId),
  );
  const playlist = section?.modules ?? [];
  const self = playlist.find((m) => m.id === moduleId);
  // Absent du catalogue = hors du public visé : on ne divulgue pas le contenu.
  if (!self) return null;

  const progress = await prisma.employeeFormationProgress.findUnique({
    where: { userId_moduleId: { userId, moduleId } },
  });

  const steps = parseFormationSteps(formationModule.steps);
  const dayOk = self.unlocked;

  return {
    id: formationModule.id,
    title: formationModule.title,
    summary: formationModule.summary,
    kind: formationModule.kind,
    stationId: formationModule.stationId,
    categoryId: formationModule.categoryId,
    station: formationModule.station,
    isMandatory: formationModule.isMandatory,
    requiresSignature: formationModule.requiresSignature,
    estimatedMinutes: formationModule.estimatedMinutes,
    stepCount: steps.length,
    status: progress?.status ?? "NOT_STARTED",
    completedAt: progress?.completedAt?.toISOString() ?? null,
    videoUrl: formationModule.videoUrl,
    body: formationModule.body,
    steps,
    signatureName: progress?.signatureName ?? null,
    signedAt: progress?.signedAt?.toISOString() ?? null,
    unlockDay: formationModule.unlockDay,
    unlocked: dayOk,
    lockedLabel: self.lockedLabel,
    assigned: self.assigned,
    dueAt: self.dueAt,
    playlist,
  };
}

export async function getTrainingComplianceForUser(
  userId: string,
  locationId?: string,
  stationId?: string,
): Promise<TrainingComplianceSnapshot | null> {
  const [resolvedStationId, location] = await Promise.all([
    stationId ? Promise.resolve(stationId) : resolvePrimaryStationId(userId, locationId),
    resolveLocationContext(userId, locationId),
  ]);
  if (!resolvedStationId || !location) return null;

  const station = await prisma.station.findUnique({
    where: { id: resolvedStationId },
    select: { nameFr: true, nameEn: true, nameEs: true },
  });
  if (!station) return null;

  const viewer = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // Bloquer le pointage n'est légitime que pour ce qui est réellement affecté
  // à l'employé — jamais pour un module consulté en polyvalence.
  const modules = await prisma.formationModule.findMany({
    where: {
      isActive: true,
      isMandatory: true,
      kind: { not: "ONBOARDING" },
      OR: [
        { locationId: location.id },
        { locationId: null, organizationId: location.organizationId },
        { locationId: null, organizationId: null },
      ],
      assignments: {
        some: {
          OR: [
            { audience: "EVERYONE" },
            { audience: "ROLE", role: viewer?.role ?? "EMPLOYEE" },
            { audience: "STATION", stationId: resolvedStationId },
            { audience: "USER", userId },
          ],
        },
      },
    },
    select: { id: true, title: true },
  });

  if (modules.length === 0) {
    return { stationId: resolvedStationId, station, missingModules: [], isCompliant: true };
  }

  const completed = await prisma.employeeFormationProgress.findMany({
    where: {
      userId,
      moduleId: { in: modules.map((m) => m.id) },
      status: "COMPLETED",
    },
    select: { moduleId: true },
  });
  const completedIds = new Set(completed.map((row) => row.moduleId));
  const missingModules = modules
    .filter((module) => !completedIds.has(module.id))
    .map((module) => ({ id: module.id, title: module.title }));

  return {
    stationId: resolvedStationId,
    station,
    missingModules,
    isCompliant: missingModules.length === 0,
  };
}
