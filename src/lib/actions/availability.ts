"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type AvailabilityActionResult = { ok: true } | { ok: false; error: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidSlot(slot: { dayOfWeek: number; startTime: string; endTime: string }) {
  if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
    return false;
  }
  if (!TIME_PATTERN.test(slot.startTime) || !TIME_PATTERN.test(slot.endTime)) {
    return false;
  }
  return minutesFromTime(slot.endTime) > minutesFromTime(slot.startTime);
}

export async function updateWeeklyAvailability(input: {
  lang: string;
  availabilities: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
}): Promise<AvailabilityActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };

    for (const slot of input.availabilities) {
      if (!isValidSlot(slot)) return { ok: false, error: "invalid_slot" };
    }

    const profile = await prisma.employeeProfile.findUnique({
      where: { userId: sessionUser.id },
    });
    if (!profile) return { ok: false, error: "profile_not_found" };

    await prisma.$transaction([
      prisma.employeeAvailability.deleteMany({
        where: { profileId: profile.id, isRecurring: true },
      }),
      ...(input.availabilities.length > 0
        ? [
            prisma.employeeAvailability.createMany({
              data: input.availabilities.map((slot) => ({
                profileId: profile.id,
                dayOfWeek: slot.dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
                isRecurring: true,
              })),
            }),
          ]
        : []),
    ]);

    revalidatePath(`/${input.lang}/settings/availability`, "page");
    revalidatePath(`/${input.lang}/settings`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("availability", error);
  }
}
