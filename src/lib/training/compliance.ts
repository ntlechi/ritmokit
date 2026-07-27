import { prisma } from "@/lib/prisma";

export type IncompleteFormationModule = {
  id: string;
  title: string;
  kind: string;
  stationId: string;
};

export async function getMandatoryModulesForStation(
  stationId: string,
  locationId: string,
  organizationId: string,
) {
  return prisma.formationModule.findMany({
    where: {
      isActive: true,
      isMandatory: true,
      kind: { not: "ONBOARDING" },
      stationId,
      OR: [
        { locationId },
        { locationId: null, organizationId },
        { locationId: null, organizationId: null },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      kind: true,
      stationId: true,
    },
  });
}

export async function getIncompleteMandatoryModules(
  userId: string,
  stationId: string,
  locationId: string,
  organizationId: string,
): Promise<IncompleteFormationModule[]> {
  const modules = await getMandatoryModulesForStation(stationId, locationId, organizationId);
  if (modules.length === 0) return [];

  const completed = await prisma.employeeFormationProgress.findMany({
    where: {
      userId,
      moduleId: { in: modules.map((m) => m.id) },
      status: "COMPLETED",
    },
    select: { moduleId: true },
  });

  const completedIds = new Set(completed.map((row) => row.moduleId));
  return modules
    .filter((module) => !completedIds.has(module.id) && module.stationId != null)
    .map((module) => ({
      id: module.id,
      title: module.title,
      kind: module.kind,
      stationId: module.stationId!,
    }));
}

export async function isTrainingCompliantForShift(
  userId: string,
  stationId: string,
  locationId: string,
): Promise<{ compliant: true } | { compliant: false; missing: IncompleteFormationModule[] }> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { organizationId: true },
  });
  if (!location) return { compliant: true };

  const missing = await getIncompleteMandatoryModules(
    userId,
    stationId,
    locationId,
    location.organizationId,
  );
  if (missing.length === 0) return { compliant: true };
  return { compliant: false, missing };
}
