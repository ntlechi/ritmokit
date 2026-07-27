import "server-only";

import type { OnboardingStatus } from "@/generated/prisma/enums";
import { hasSignedCurrentConvention } from "@/lib/data/workplace-convention";
import { prisma } from "@/lib/prisma";
import {
  civilDateString,
  civilDaysBetween,
  locationTimeZone,
} from "@/lib/time/location-timezone";

export type OnboardingModuleItem = {
  id: string;
  title: string;
  completed: boolean;
  unlockDay: number;
  unlocked: boolean;
  lockedLabel: string | null;
};

export type OnboardingSnapshot = {
  status: OnboardingStatus;
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
  onboardingModules: OnboardingModuleItem[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  sinLastFour: string | null;
  hasSignedHandbook: boolean;
  handbookSignatureName: string | null;
  hasPunchPin: boolean;
  /** J-day seniority; 0 when the hire anchor is missing (progressive unlocks stay gated). */
  seniorityDays: number;
  /** True when neither integrationStartedAt nor hiredAt is set — manager must configure start date. */
  seniorityAnchorMissing: boolean;
  /** Civil YYYY-MM-DD of the resolved anchor in the location TZ, when present. */
  seniorityAnchorCivilDate: string | null;
  orgName: string | null;
  orgPrimaryColor: string | null;
  orgWelcomeCopy: string | null;
};

export type SeniorityAnchorSource = "integration_started_at" | "hired_at";

export type SeniorityAnchorResult =
  | {
      ok: true;
      anchor: Date;
      source: SeniorityAnchorSource;
      civilDate: string;
    }
  | { ok: false; error: "missing_hire_anchor" };

export class MissingHireAnchorError extends Error {
  readonly code = "missing_hire_anchor" as const;

  constructor(readonly userId: string) {
    super(`Missing hire anchor for user ${userId} — set hiredAt or integrationStartedAt`);
    this.name = "MissingHireAnchorError";
  }
}

async function resolveLocationContext(userId: string) {
  const membership = await prisma.locationMember.findFirst({
    where: { userId, isPrimary: true },
    include: {
      location: {
        select: {
          id: true,
          organizationId: true,
          organization: {
            select: { name: true, primaryColor: true, welcomeCopy: true },
          },
        },
      },
    },
  });
  return membership;
}

/**
 * Resolve the hire/integration anchor — civil clocks only.
 * Does NOT fall back to user.createdAt or new Date() (silent J0 pin).
 */
export function resolveSeniorityAnchor(input: {
  integrationStartedAt: Date | null | undefined;
  hiredAt: Date | null | undefined;
  locationId: string;
}): SeniorityAnchorResult {
  const timeZone = locationTimeZone(input.locationId);

  if (input.integrationStartedAt) {
    return {
      ok: true,
      anchor: input.integrationStartedAt,
      source: "integration_started_at",
      civilDate: civilDateString(input.integrationStartedAt, timeZone),
    };
  }
  if (input.hiredAt) {
    return {
      ok: true,
      anchor: input.hiredAt,
      source: "hired_at",
      civilDate: civilDateString(input.hiredAt, timeZone),
    };
  }
  return { ok: false, error: "missing_hire_anchor" };
}

/** Civil day difference via locationTimeZone seam (floor, never negative). */
export function seniorityDaysSince(
  anchor: Date,
  locationId: string,
  now: Date = new Date(),
): number {
  return civilDaysBetween(anchor, now, locationTimeZone(locationId));
}

/**
 * Strict variant — throws MissingHireAnchorError when no valid hire clock exists.
 * Prefer for paths that must not silently default to J0.
 */
export function requireSeniorityAnchor(input: {
  userId: string;
  integrationStartedAt: Date | null | undefined;
  hiredAt: Date | null | undefined;
  locationId: string;
}): Extract<SeniorityAnchorResult, { ok: true }> {
  const resolved = resolveSeniorityAnchor(input);
  if (!resolved.ok) throw new MissingHireAnchorError(input.userId);
  return resolved;
}

async function getMandatoryOnboardingModules(organizationId: string, locationId: string) {
  return prisma.formationModule.findMany({
    where: {
      kind: "ONBOARDING",
      isMandatory: true,
      isActive: true,
      OR: [
        { locationId },
        { locationId: null, organizationId },
        { locationId: null, organizationId: null },
      ],
    },
    orderBy: [{ unlockDay: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, title: true, unlockDay: true, sortOrder: true },
  });
}

function hasEmergencyContact(
  name: string | null | undefined,
  phone: string | null | undefined,
): boolean {
  return Boolean(name?.trim() && phone?.trim());
}

export async function buildOnboardingSnapshot(userId: string): Promise<OnboardingSnapshot> {
  const membership = await resolveLocationContext(userId);
  const location = membership?.location ?? null;
  const locationId = location?.id ?? "";

  const [hrProfile, modules] = await Promise.all([
    prisma.employeeHrProfile.findUnique({ where: { userId } }),
    location
      ? getMandatoryOnboardingModules(location.organizationId, location.id)
      : Promise.resolve([]),
  ]);

  const anchorResult =
    locationId.length > 0
      ? resolveSeniorityAnchor({
          integrationStartedAt: hrProfile?.integrationStartedAt,
          hiredAt: membership?.hiredAt,
          locationId,
        })
      : ({ ok: false, error: "missing_hire_anchor" } as const);

  const seniorityAnchorMissing = !anchorResult.ok;
  const seniorityDays = anchorResult.ok
    ? seniorityDaysSince(anchorResult.anchor, locationId)
    : 0;
  const seniorityAnchorCivilDate = anchorResult.ok ? anchorResult.civilDate : null;

  const completedRows =
    modules.length > 0
      ? await prisma.employeeFormationProgress.findMany({
          where: {
            userId,
            moduleId: { in: modules.map((m) => m.id) },
            status: "COMPLETED",
          },
          select: { moduleId: true },
        })
      : [];

  const completedIds = new Set(completedRows.map((row) => row.moduleId));

  let previousUnlockedCompleted = true;
  const onboardingModules: OnboardingModuleItem[] = modules.map((module) => {
    const completed = completedIds.has(module.id);
    // Missing hire anchor: only unlockDay <= 0 modules may unlock (no silent J0 progression).
    const dayOk =
      module.unlockDay <= 0 ||
      (!seniorityAnchorMissing && module.unlockDay <= seniorityDays);
    const unlocked = dayOk && previousUnlockedCompleted;
    const lockedLabel = !unlocked
      ? seniorityAnchorMissing && module.unlockDay > 0
        ? "Date d'embauche requise"
        : !dayOk
          ? `Disponible J${module.unlockDay}`
          : "Complète le module précédent"
      : null;
    if (unlocked) {
      previousUnlockedCompleted = completed;
    }
    return {
      id: module.id,
      title: module.title,
      completed,
      unlockDay: module.unlockDay,
      unlocked,
      lockedLabel,
    };
  });

  const availableModules = onboardingModules.filter((m) => m.unlocked);
  const hasPunchPin = Boolean(hrProfile?.punchPinHash && hrProfile?.punchPinSalt);

  const step1Complete =
    hasEmergencyContact(hrProfile?.emergencyContactName, hrProfile?.emergencyContactPhone) &&
    (hasPunchPin || Boolean(hrProfile?.hasSignedHandbook));
  const step2Complete =
    (await hasSignedCurrentConvention(userId)) || Boolean(hrProfile?.hasSignedHandbook);
  const step3Complete =
    availableModules.length === 0 || availableModules.every((module) => module.completed);

  let status: OnboardingStatus = hrProfile?.onboardingStatus ?? "NOT_STARTED";
  if (step1Complete || step2Complete || onboardingModules.some((m) => m.completed)) {
    status = step1Complete && step2Complete && step3Complete ? "COMPLETED" : "IN_PROGRESS";
  }

  return {
    status,
    step1Complete,
    step2Complete,
    step3Complete,
    onboardingModules,
    emergencyContactName: hrProfile?.emergencyContactName ?? null,
    emergencyContactPhone: hrProfile?.emergencyContactPhone ?? null,
    sinLastFour: hrProfile?.sinLastFour ?? null,
    hasSignedHandbook: step2Complete,
    handbookSignatureName: hrProfile?.handbookSignatureName ?? null,
    hasPunchPin,
    seniorityDays,
    seniorityAnchorMissing,
    seniorityAnchorCivilDate,
    orgName: location?.organization.name ?? null,
    orgPrimaryColor: location?.organization.primaryColor ?? null,
    orgWelcomeCopy: location?.organization.welcomeCopy ?? null,
  };
}

export async function refreshOnboardingStatus(userId: string) {
  const snapshot = await buildOnboardingSnapshot(userId);
  const allComplete = snapshot.step1Complete && snapshot.step2Complete && snapshot.step3Complete;

  await prisma.employeeHrProfile.upsert({
    where: { userId },
    update: {
      onboardingStatus: allComplete
        ? "COMPLETED"
        : snapshot.step1Complete ||
            snapshot.step2Complete ||
            snapshot.onboardingModules.some((m) => m.completed)
          ? "IN_PROGRESS"
          : "NOT_STARTED",
    },
    create: {
      userId,
      onboardingStatus: allComplete ? "COMPLETED" : "NOT_STARTED",
    },
  });

  return snapshot;
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const snapshot = await refreshOnboardingStatus(userId);
  return snapshot.step1Complete && snapshot.step2Complete && snapshot.step3Complete;
}
