import "server-only";

import type { OnboardingTaskKey } from "@/generated/prisma/enums";
import { buildOnboardingSnapshot } from "@/lib/hr/onboarding";
import { prisma } from "@/lib/prisma";

export const ONBOARDING_TASK_SCHEDULE: { key: OnboardingTaskKey; days: number }[] = [
  { key: "UNIFORM_AND_PWA", days: 1 },
  { key: "FLOOR_FEEDBACK_J7", days: 7 },
  { key: "INTEGRATION_REVIEW_J30", days: 30 },
];

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Employé d'expérience sur la même station — onboarding complété, embauché le plus tôt. */
export async function findBestBuddyCandidate(input: {
  locationId: string;
  stationId: string;
  excludeUserId: string;
}): Promise<string | null> {
  const members = await prisma.locationMember.findMany({
    where: {
      locationId: input.locationId,
      stationId: input.stationId,
      userId: { not: input.excludeUserId },
      user: { role: { in: ["EMPLOYEE", "MANAGER"] } },
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          hrProfile: { select: { onboardingStatus: true } },
        },
      },
    },
    orderBy: [{ hiredAt: "asc" }, { createdAt: "asc" }],
  });

  for (const member of members) {
    if (member.user.role !== "EMPLOYEE") continue;
    const snapshot = await buildOnboardingSnapshot(member.user.id);
    if (snapshot.step1Complete && snapshot.step2Complete && snapshot.step3Complete) {
      return member.user.id;
    }
  }

  const manager = members.find((m) => m.user.role === "MANAGER");
  if (manager) return manager.user.id;

  const fallback = await prisma.locationMember.findFirst({
    where: {
      locationId: input.locationId,
      userId: { not: input.excludeUserId },
      user: { role: { in: ["EMPLOYEE", "MANAGER", "OWNER"] } },
    },
    orderBy: [{ hiredAt: "asc" }, { createdAt: "asc" }],
    select: { userId: true },
  });

  return fallback?.userId ?? null;
}

export async function generateOnboardingChecklist(input: {
  locationId: string;
  recruitUserId: string;
  anchorDate: Date;
}) {
  const anchor = startOfUtcDay(input.anchorDate);

  await Promise.all(
    ONBOARDING_TASK_SCHEDULE.map((item) =>
      prisma.onboardingTask.upsert({
        where: {
          locationId_userId_taskKey: {
            locationId: input.locationId,
            userId: input.recruitUserId,
            taskKey: item.key,
          },
        },
        create: {
          locationId: input.locationId,
          userId: input.recruitUserId,
          taskKey: item.key,
          dueDate: addUtcDays(anchor, item.days),
        },
        update: {},
      }),
    ),
  );
}

/**
 * Initialise buddy + checklist pour une recrue.
 * Idempotent : ne réassigne pas un buddy existant ni ne duplique les tâches.
 */
export async function initializeRecruitIntegration(input: {
  locationId: string;
  recruitUserId: string;
  stationId: string;
  buddyUserId?: string | null;
  anchorDate?: Date;
}): Promise<{ buddyId: string | null; created: boolean }> {
  const existing = await prisma.employeeHrProfile.findUnique({
    where: { userId: input.recruitUserId },
    select: { buddyId: true, integrationStartedAt: true },
  });

  const buddyId =
    existing?.buddyId ??
    input.buddyUserId ??
    (await findBestBuddyCandidate({
      locationId: input.locationId,
      stationId: input.stationId,
      excludeUserId: input.recruitUserId,
    }));

  const anchorDate = existing?.integrationStartedAt ?? input.anchorDate ?? new Date();

  await prisma.employeeHrProfile.upsert({
    where: { userId: input.recruitUserId },
    create: {
      userId: input.recruitUserId,
      buddyId,
      integrationStartedAt: anchorDate,
      onboardingStatus: "IN_PROGRESS",
    },
    update: {
      buddyId: existing?.buddyId ? undefined : buddyId,
      integrationStartedAt: existing?.integrationStartedAt ? undefined : anchorDate,
    },
  });

  const taskCount = await prisma.onboardingTask.count({
    where: { locationId: input.locationId, userId: input.recruitUserId },
  });

  if (taskCount === 0) {
    await generateOnboardingChecklist({
      locationId: input.locationId,
      recruitUserId: input.recruitUserId,
      anchorDate,
    });
  }

  return { buddyId, created: taskCount === 0 };
}

/** Ouvre ou récupère une conversation 1:1 entre deux membres d'une succursale. */
export async function getOrCreateDirectConversation(input: {
  locationId: string;
  userIdA: string;
  userIdB: string;
}): Promise<string> {
  const existing = await prisma.directConversation.findFirst({
    where: {
      locationId: input.locationId,
      AND: [
        { participants: { some: { userId: input.userIdA } } },
        { participants: { some: { userId: input.userIdB } } },
      ],
    },
    include: {
      participants: { select: { userId: true } },
    },
  });

  // Strict 1:1 — ignore any conversation that somehow has extra participants.
  if (existing && existing.participants.length === 2) {
    return existing.id;
  }

  const conversation = await prisma.directConversation.create({
    data: {
      locationId: input.locationId,
      participants: {
        create: [{ userId: input.userIdA }, { userId: input.userIdB }],
      },
    },
    select: { id: true },
  });

  return conversation.id;
}
