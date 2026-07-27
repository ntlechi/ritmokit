import "server-only";

import { prisma } from "@/lib/prisma";

export type AvailabilitySlot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type WeeklyAvailability = {
  profileId: string;
  slots: AvailabilitySlot[];
};

export async function getWeeklyAvailabilityForUser(userId: string): Promise<WeeklyAvailability | null> {
  const profile = await prisma.employeeProfile.findUnique({
    where: { userId },
    include: {
      availabilities: {
        where: { isRecurring: true },
        orderBy: { dayOfWeek: "asc" },
      },
    },
  });

  if (!profile) return null;

  return {
    profileId: profile.id,
    slots: profile.availabilities.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
    })),
  };
}
