import "server-only";

import type { OnboardingStatus } from "@/generated/prisma/enums";
import { buildOnboardingSnapshot } from "@/lib/hr/onboarding";
import { prisma } from "@/lib/prisma";

export type EmployeeOnboardingState = Awaited<ReturnType<typeof buildOnboardingSnapshot>>;

export async function getEmployeeOnboardingState(userId: string): Promise<EmployeeOnboardingState> {
  return buildOnboardingSnapshot(userId);
}

export type TeamOnboardingSummary = {
  userId: string;
  status: OnboardingStatus;
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
};

export async function getTeamOnboardingSummaries(
  userIds: string[],
): Promise<Map<string, TeamOnboardingSummary>> {
  const map = new Map<string, TeamOnboardingSummary>();
  if (userIds.length === 0) return map;

  const summaries = await Promise.all(
    userIds.map(async (userId) => {
      const snapshot = await buildOnboardingSnapshot(userId);
      return {
        userId,
        status: snapshot.status,
        step1Complete: snapshot.step1Complete,
        step2Complete: snapshot.step2Complete,
        step3Complete: snapshot.step3Complete,
      };
    }),
  );

  for (const row of summaries) {
    map.set(row.userId, row);
  }
  return map;
}

export async function getManagerOnboardingRoster(locationId: string) {
  const members = await prisma.locationMember.findMany({
    where: {
      locationId,
      user: { role: "EMPLOYEE" },
    },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { user: { fullName: "asc" } },
  });

  const summaries = await getTeamOnboardingSummaries(members.map((m) => m.userId));

  return members.map((member) => ({
    userId: member.userId,
    fullName: member.user.fullName,
    email: member.user.email,
    onboarding: summaries.get(member.userId) ?? {
      status: "NOT_STARTED" as OnboardingStatus,
      step1Complete: false,
      step2Complete: false,
      step3Complete: false,
    },
  }));
}
