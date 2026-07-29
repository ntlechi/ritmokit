"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { actionDatabaseError } from "@/lib/actions/result";

export type StaffingActionResult = { ok: true } | { ok: false; error: string };

/** Staffing profile persistence retired — coverage uses studio defaults per station slug. */
export async function updateStaffingProfileAction(_input: {
  stationId: string;
  studentsPerHour: number;
  classMixSharePercent: number;
  minHeadcount: number;
  maxHeadcount: number;
}): Promise<StaffingActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    revalidatePath("/[lang]/calendar/manager/schedule", "page");
    revalidatePath("/[lang]/calendar/week", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("staffing", error);
  }
}
