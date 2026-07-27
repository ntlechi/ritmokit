import "server-only";

import type { OnboardingTaskKey } from "@/generated/prisma/enums";
import { buildOnboardingSnapshot } from "@/lib/hr/onboarding";
import { prisma } from "@/lib/prisma";

export type EmployeeBuddyCard = {
  buddyId: string;
  buddyName: string;
  buddyStation: string | null;
  integrationStartedAt: string | null;
};

export type ManagerOnboardingTaskRow = {
  id: string;
  taskKey: OnboardingTaskKey;
  dueDate: string;
  completedAt: string | null;
  completedByName: string | null;
  isOverdue: boolean;
};

export type ManagerRecruitRow = {
  userId: string;
  fullName: string;
  email: string;
  station: string;
  hiredAt: string | null;
  /** Neither hiredAt nor integrationStartedAt — J-day unlocks are frozen. */
  hireAnchorMissing: boolean;
  onboardingComplete: boolean;
  buddyId: string | null;
  buddyName: string | null;
  tasks: ManagerOnboardingTaskRow[];
  pendingCount: number;
  overdueCount: number;
};

export type ManagerOnboardingDashboard = {
  locationId: string;
  locationName: string;
  recruits: ManagerRecruitRow[];
};

export async function getEmployeeBuddyCard(userId: string): Promise<EmployeeBuddyCard | null> {
  const hrProfile = await prisma.employeeHrProfile.findUnique({
    where: { userId },
    include: {
      buddy: {
        include: {
          locationMembers: {
            where: { isPrimary: true },
            take: 1,
            select: { station: { select: { nameFr: true } } },
          },
        },
      },
    },
  });

  if (!hrProfile?.buddyId || !hrProfile.buddy) return null;

  return {
    buddyId: hrProfile.buddyId,
    buddyName: hrProfile.buddy.fullName,
    buddyStation: hrProfile.buddy.locationMembers[0]?.station?.nameFr ?? null,
    integrationStartedAt: hrProfile.integrationStartedAt?.toISOString() ?? null,
  };
}

function isOverdue(dueDate: Date, completedAt: Date | null): boolean {
  if (completedAt) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return dueDate < today;
}

export async function getManagerOnboardingDashboard(
  managerUserId: string,
): Promise<ManagerOnboardingDashboard | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId: managerUserId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
  if (!membership) return null;

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 90);

  const members = await prisma.locationMember.findMany({
    where: {
      locationId: membership.locationId,
      user: { role: "EMPLOYEE" },
      OR: [{ hiredAt: { gte: windowStart } }, { hiredAt: null }],
    },
    include: {
      station: { select: { nameFr: true } },
      user: {
        include: {
          hrProfile: {
            include: { buddy: { select: { id: true, fullName: true } } },
          },
        },
      },
    },
    orderBy: [{ hiredAt: "desc" }, { user: { fullName: "asc" } }],
  });

  const userIds = members.map((m) => m.userId);
  const tasks = await prisma.onboardingTask.findMany({
    where: { locationId: membership.locationId, userId: { in: userIds } },
    include: { completedBy: { select: { fullName: true } } },
    orderBy: [{ dueDate: "asc" }],
  });

  const tasksByUser = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const bucket = tasksByUser.get(task.userId) ?? [];
    bucket.push(task);
    tasksByUser.set(task.userId, bucket);
  }

  const recruits: ManagerRecruitRow[] = [];

  for (const member of members) {
    const snapshot = await buildOnboardingSnapshot(member.userId);
    const onboardingComplete =
      snapshot.step1Complete && snapshot.step2Complete && snapshot.step3Complete;

    const userTasks = tasksByUser.get(member.userId) ?? [];
    const taskRows: ManagerOnboardingTaskRow[] = userTasks.map((task) => ({
      id: task.id,
      taskKey: task.taskKey,
      dueDate: task.dueDate.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
      completedByName: task.completedBy?.fullName ?? null,
      isOverdue: isOverdue(task.dueDate, task.completedAt),
    }));

    const pendingCount = taskRows.filter((t) => !t.completedAt).length;
    const overdueCount = taskRows.filter((t) => t.isOverdue).length;

    if (
      !onboardingComplete ||
      userTasks.length > 0 ||
      pendingCount > 0 ||
      snapshot.seniorityAnchorMissing
    ) {
      recruits.push({
        userId: member.userId,
        fullName: member.user.fullName,
        email: member.user.email,
        station: member.station?.nameFr ?? member.stationId,
        hiredAt: member.hiredAt?.toISOString() ?? null,
        hireAnchorMissing: snapshot.seniorityAnchorMissing,
        onboardingComplete,
        buddyId: member.user.hrProfile?.buddyId ?? null,
        buddyName: member.user.hrProfile?.buddy?.fullName ?? null,
        tasks: taskRows,
        pendingCount,
        overdueCount,
      });
    }
  }

  return {
    locationId: membership.locationId,
    locationName: membership.location.name,
    recruits,
  };
}
