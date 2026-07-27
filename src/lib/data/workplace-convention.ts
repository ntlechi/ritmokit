import "server-only";

import type { DisciplineStep } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import {
  DISCIPLINE_WINDOW_MONTHS,
  getConventionContent,
  getInfractionDefinition,
  getInfractionLabel,
  getManagerScript,
  INFRACTION_DEFINITIONS,
  resolveNextDisciplineStep,
  stepRequiresEmployeeSignature,
  WORKPLACE_CONVENTION_VERSION,
  type WorkplaceInfractionCode,
} from "@/lib/policy/workplace-convention";

export type ConventionSignatureStatus = {
  version: string;
  signed: boolean;
  signatureName: string | null;
  signedAt: string | null;
  employeeComment: string | null;
};

export type EmployeeConventionView = {
  version: string;
  status: ConventionSignatureStatus;
};

export type DisciplineRecordEntry = {
  id: string;
  infractionCode: WorkplaceInfractionCode;
  infractionLabel: string;
  disciplineStep: DisciplineStep;
  facts: string;
  managerNotes: string | null;
  managerScript: string | null;
  employeeComment: string | null;
  occurredAt: string;
  requiresEmployeeSignature: boolean;
  employeeSignatureName: string | null;
  employeeSignedAt: string | null;
  managerName: string;
  createdAt: string;
};

export type ManagerConventionRosterEntry = {
  userId: string;
  fullName: string;
  stationColorHex: string | null;
  signed: boolean;
  signatureName: string | null;
  signedAt: string | null;
};

export type ConventionLocationStats = {
  version: string;
  signedCount: number;
  totalEmployees: number;
  signedPercent: number;
  pendingCount: number;
  pendingUserIds: string[];
};

export type ManagerConventionReport = {
  locationId: string;
  locationName: string;
  version: string;
  signedCount: number;
  totalEmployees: number;
  roster: ManagerConventionRosterEntry[];
  recentRecords: DisciplineRecordEntry[];
  infractionOptions: { code: WorkplaceInfractionCode; label: string; isGross: boolean }[];
};

export async function getConventionLocationStats(locationId: string): Promise<ConventionLocationStats> {
  const members = await prisma.locationMember.findMany({
    where: { locationId, user: { role: "EMPLOYEE" } },
    select: { userId: true },
  });

  const employeeIds = members.map((m) => m.userId);
  const signatureRows =
    employeeIds.length === 0
      ? []
      : await prisma.workplaceConventionSignature.findMany({
          where: {
            version: WORKPLACE_CONVENTION_VERSION,
            userId: { in: employeeIds },
          },
          select: { userId: true },
        });

  const signedIds = new Set(signatureRows.map((s) => s.userId));
  const pendingUserIds = employeeIds.filter((id) => !signedIds.has(id));
  const signedCount = signedIds.size;
  const totalEmployees = employeeIds.length;
  const signedPercent =
    totalEmployees === 0 ? 100 : Math.round((signedCount / totalEmployees) * 1000) / 10;

  return {
    version: WORKPLACE_CONVENTION_VERSION,
    signedCount,
    totalEmployees,
    signedPercent,
    pendingCount: pendingUserIds.length,
    pendingUserIds,
  };
}

async function buildConventionRoster(locationId: string): Promise<ManagerConventionRosterEntry[]> {
  const members = await prisma.locationMember.findMany({
    where: { locationId, user: { role: "EMPLOYEE" } },
    include: {
      user: { select: { id: true, fullName: true } },
      station: { select: { colorHex: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  const employeeIds = members.map((m) => m.userId);
  const signatureRows =
    employeeIds.length === 0
      ? []
      : await prisma.workplaceConventionSignature.findMany({
          where: {
            version: WORKPLACE_CONVENTION_VERSION,
            userId: { in: employeeIds },
          },
        });
  const sigByUser = new Map(signatureRows.map((s) => [s.userId, s]));

  return members.map((m) => {
    const sig = sigByUser.get(m.userId);
    return {
      userId: m.userId,
      fullName: m.user.fullName,
      stationColorHex: m.station.colorHex,
      signed: Boolean(sig),
      signatureName: sig?.signatureName ?? null,
      signedAt: sig?.signedAt.toISOString() ?? null,
    };
  });
}

async function resolveManagerLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: { select: { id: true, name: true, organizationId: true } },
    },
  });
}

export async function getConventionSignatureStatus(userId: string): Promise<ConventionSignatureStatus> {
  const row = await prisma.workplaceConventionSignature.findUnique({
    where: {
      userId_version: { userId, version: WORKPLACE_CONVENTION_VERSION },
    },
  });

  return {
    version: WORKPLACE_CONVENTION_VERSION,
    signed: Boolean(row),
    signatureName: row?.signatureName ?? null,
    signedAt: row?.signedAt.toISOString() ?? null,
    employeeComment: row?.employeeComment ?? null,
  };
}

export async function hasSignedCurrentConvention(userId: string): Promise<boolean> {
  const status = await getConventionSignatureStatus(userId);
  return status.signed;
}

export async function getEmployeeConventionView(userId: string): Promise<EmployeeConventionView> {
  const status = await getConventionSignatureStatus(userId);
  return { version: WORKPLACE_CONVENTION_VERSION, status };
}

export async function countPriorInfractions(
  employeeId: string,
  infractionCode: WorkplaceInfractionCode,
  beforeDate = new Date(),
): Promise<number> {
  const windowStart = new Date(beforeDate);
  windowStart.setMonth(windowStart.getMonth() - DISCIPLINE_WINDOW_MONTHS);

  return prisma.disciplinaryRecord.count({
    where: {
      employeeId,
      infractionCode,
      occurredAt: { gte: windowStart, lt: beforeDate },
      disciplineStep: { not: "GROSS_MISCONDUCT" },
    },
  });
}

export async function previewDisciplineStep(
  employeeId: string,
  infractionCode: WorkplaceInfractionCode,
): Promise<DisciplineStep> {
  const def = getInfractionDefinition(infractionCode);
  const prior = await countPriorInfractions(employeeId, infractionCode);
  return resolveNextDisciplineStep(prior, def.isGrossMisconduct);
}

export async function getEmployeeDisciplineRecords(
  userId: string,
  lang: Locale,
): Promise<DisciplineRecordEntry[]> {
  const rows = await prisma.disciplinaryRecord.findMany({
    where: { employeeId: userId },
    orderBy: { occurredAt: "desc" },
    take: 20,
    include: { manager: { select: { fullName: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    infractionCode: row.infractionCode as WorkplaceInfractionCode,
    infractionLabel: getInfractionLabel(row.infractionCode as WorkplaceInfractionCode, lang),
    disciplineStep: row.disciplineStep,
    facts: row.facts,
    managerNotes: row.managerNotes,
    managerScript: row.managerScript,
    employeeComment: row.employeeComment,
    occurredAt: row.occurredAt.toISOString(),
    requiresEmployeeSignature: row.requiresEmployeeSignature,
    employeeSignatureName: row.employeeSignatureName,
    employeeSignedAt: row.employeeSignedAt?.toISOString() ?? null,
    managerName: row.manager.fullName,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getManagerConventionReport(
  userId: string,
  role: string,
  lang: Locale,
): Promise<{ ok: true; data: ManagerConventionReport } | { ok: false; error: "unauthorized" }> {
  if (!canAccessManagerSettings(role as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await resolveManagerLocation(userId);
  if (!membership) return { ok: false, error: "unauthorized" };

  const locationId = membership.locationId;

  const [roster, recentRecords] = await Promise.all([
    buildConventionRoster(locationId),
    prisma.disciplinaryRecord.findMany({
      where: { locationId },
      orderBy: { occurredAt: "desc" },
      take: 30,
      include: { manager: { select: { fullName: true } } },
    }),
  ]);

  return {
    ok: true,
    data: {
      locationId,
      locationName: membership.location.name,
      version: WORKPLACE_CONVENTION_VERSION,
      signedCount: roster.filter((r) => r.signed).length,
      totalEmployees: roster.length,
      roster,
      recentRecords: recentRecords.map((row) => ({
        id: row.id,
        infractionCode: row.infractionCode as WorkplaceInfractionCode,
        infractionLabel: getInfractionLabel(row.infractionCode as WorkplaceInfractionCode, lang),
        disciplineStep: row.disciplineStep,
        facts: row.facts,
        managerNotes: row.managerNotes,
        managerScript: row.managerScript,
        employeeComment: row.employeeComment,
        occurredAt: row.occurredAt.toISOString(),
        requiresEmployeeSignature: row.requiresEmployeeSignature,
        employeeSignatureName: row.employeeSignatureName,
        employeeSignedAt: row.employeeSignedAt?.toISOString() ?? null,
        managerName: row.manager.fullName,
        createdAt: row.createdAt.toISOString(),
      })),
      infractionOptions: INFRACTION_DEFINITIONS.map((d) => ({
        code: d.code,
        label: d.labels[lang],
        isGross: d.isGrossMisconduct,
      })),
    },
  };
}

export async function getDisciplinePreviewForEmployee(
  managerUserId: string,
  role: string,
  employeeId: string,
  infractionCode: WorkplaceInfractionCode,
  lang: Locale,
): Promise<
  | {
      ok: true;
      step: DisciplineStep;
      script: string;
      priorCount: number;
      requiresSignature: boolean;
    }
  | { ok: false; error: string }
> {
  if (!canAccessManagerSettings(role as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await resolveManagerLocation(managerUserId);
  if (!membership) return { ok: false, error: "unauthorized" };

  const employeeMember = await prisma.locationMember.findUnique({
    where: { locationId_userId: { locationId: membership.locationId, userId: employeeId } },
  });
  if (!employeeMember) return { ok: false, error: "employee_not_found" };

  const def = getInfractionDefinition(infractionCode);
  const priorCount = await countPriorInfractions(employeeId, infractionCode);
  const step = resolveNextDisciplineStep(priorCount, def.isGrossMisconduct);
  const script = getManagerScript(infractionCode, lang, Math.min(priorCount, 1));

  return {
    ok: true,
    step,
    script,
    priorCount,
    requiresSignature: stepRequiresEmployeeSignature(step),
  };
}

export { getConventionContent, WORKPLACE_CONVENTION_VERSION };
