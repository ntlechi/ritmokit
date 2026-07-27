import "server-only";

import type { BenefitType, SkillLevel } from "@/generated/prisma/enums";
import type { StationRecord } from "@/lib/stations/display";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { nextSkillLevel } from "@/lib/skills/levels";
import { getIncompleteMandatoryModules } from "@/lib/training/compliance";

export type LocationBenefitRow = {
  id: string;
  title: string;
  description: string;
  type: BenefitType;
  isActive: boolean;
  externalUrl: string | null;
  sortOrder: number;
};

export type BenefitsManagerDashboard = {
  locationId: string;
  locationName: string;
  benefits: LocationBenefitRow[];
};

export type CareerGapModule = {
  id: string;
  title: string;
  arsiId: string | null;
};

export type EmployeeCareerPath = {
  locationId: string;
  primaryStationId: string;
  primaryStation: StationRecord | null;
  currentLevel: SkillLevel;
  nextLevel: SkillLevel | null;
  missingModules: CareerGapModule[];
  completedMandatoryCount: number;
  totalMandatoryCount: number;
};

export async function getBenefitsForManager(
  managerUserId: string,
  managerRole: string,
): Promise<BenefitsManagerDashboard | null> {
  if (!canAccessManagerSettings(managerRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return null;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId: managerUserId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
  if (!membership) return null;

  const benefits = await prisma.locationBenefit.findMany({
    where: { locationId: membership.locationId },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  return {
    locationId: membership.locationId,
    locationName: membership.location.name,
    benefits: benefits.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      type: b.type,
      isActive: b.isActive,
      externalUrl: b.externalUrl,
      sortOrder: b.sortOrder,
    })),
  };
}

export async function getActiveBenefitsForEmployee(
  userId: string,
): Promise<{ locationId: string; benefits: LocationBenefitRow[] } | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return null;

  const benefits = await prisma.locationBenefit.findMany({
    where: { locationId: membership.locationId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  return {
    locationId: membership.locationId,
    benefits: benefits.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      type: b.type,
      isActive: b.isActive,
      externalUrl: b.externalUrl,
      sortOrder: b.sortOrder,
    })),
  };
}

/**
 * Parcours de carrière : niveau actuel → prochain + modules Arsi/formation manquants.
 */
export async function getEmployeeCareerPath(userId: string): Promise<EmployeeCareerPath | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: { select: { id: true, organizationId: true } },
      station: true,
    },
  });
  if (!membership) return null;

  const skill = await prisma.employeeStationSkill.findUnique({
    where: {
      locationId_userId_stationId: {
        locationId: membership.locationId,
        userId,
        stationId: membership.stationId,
      },
    },
    select: { level: true },
  });

  const currentLevel = skill?.level ?? "JUNIOR";
  const next = nextSkillLevel(currentLevel);

  const incomplete = await getIncompleteMandatoryModules(
    userId,
    membership.stationId,
    membership.locationId,
    membership.location.organizationId,
  );

  const moduleIds = incomplete.map((m) => m.id);
  const withArsi =
    moduleIds.length > 0
      ? await prisma.formationModule.findMany({
          where: { id: { in: moduleIds } },
          select: {
            id: true,
            title: true,
            sop: { select: { arsiId: true } },
          },
        })
      : [];

  const arsiById = new Map(withArsi.map((m) => [m.id, m.sop?.arsiId ?? null]));

  const allMandatory = await prisma.formationModule.findMany({
    where: {
      isActive: true,
      isMandatory: true,
      kind: { not: "ONBOARDING" },
      stationId: membership.stationId,
      OR: [
        { locationId: membership.locationId },
        { locationId: null, organizationId: membership.location.organizationId },
        { locationId: null, organizationId: null },
      ],
    },
    select: { id: true },
  });

  const completed =
    allMandatory.length > 0
      ? await prisma.employeeFormationProgress.count({
          where: {
            userId,
            moduleId: { in: allMandatory.map((m) => m.id) },
            status: "COMPLETED",
          },
        })
      : 0;

  return {
    locationId: membership.locationId,
    primaryStationId: membership.stationId,
    primaryStation: membership.station
      ? {
          id: membership.station.id,
          locationId: membership.station.locationId,
          nameFr: membership.station.nameFr,
          nameEn: membership.station.nameEn,
          nameEs: membership.station.nameEs,
          colorHex: membership.station.colorHex,
          slug: membership.station.slug,
          sortOrder: membership.station.sortOrder,
          tipPoints: Number(membership.station.tipPoints),
          isActive: membership.station.isActive,
        }
      : null,
    currentLevel,
    nextLevel: next,
    missingModules: incomplete.map((m) => ({
      id: m.id,
      title: m.title,
      arsiId: arsiById.get(m.id) ?? null,
    })),
    completedMandatoryCount: completed,
    totalMandatoryCount: allMandatory.length,
  };
}
