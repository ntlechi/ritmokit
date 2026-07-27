"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type StaffingActionResult = { ok: true } | { ok: false; error: string };

export async function updateStaffingProfileAction(input: {
  stationId: string;
  targetSplh: number;
  salesSharePercent: number;
  minHeadcount: number;
  maxHeadcount: number;
}): Promise<StaffingActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    if (input.targetSplh <= 0) return { ok: false, error: "invalid_splh" };
    if (input.salesSharePercent < 0 || input.salesSharePercent > 100) {
      return { ok: false, error: "invalid_share" };
    }
    if (input.minHeadcount < 0 || input.maxHeadcount < input.minHeadcount) {
      return { ok: false, error: "invalid_headcount" };
    }

    const membership = await prisma.locationMember.findFirst({
      where: { userId: user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    if (!membership) return { ok: false, error: "unauthorized" };

    const station = await prisma.station.findFirst({
      where: { id: input.stationId, locationId: membership.locationId },
    });
    if (!station) return { ok: false, error: "invalid_station" };

    await prisma.staffingProfile.upsert({
      where: {
        locationId_stationId: { locationId: membership.locationId, stationId: input.stationId },
      },
      update: {
        targetSplh: input.targetSplh,
        salesSharePercent: input.salesSharePercent,
        minHeadcount: input.minHeadcount,
        maxHeadcount: input.maxHeadcount,
      },
      create: {
        locationId: membership.locationId,
        stationId: input.stationId,
        targetSplh: input.targetSplh,
        salesSharePercent: input.salesSharePercent,
        minHeadcount: input.minHeadcount,
        maxHeadcount: input.maxHeadcount,
      },
    });

    revalidatePath("/[lang]/settings/manager/staffing", "page");
    revalidatePath("/[lang]/calendar/manager/schedule", "page");
    revalidatePath("/[lang]/calendar/week", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("staffing", error);
  }
}
