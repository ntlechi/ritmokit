"use server";

import { actionDatabaseError } from "@/lib/actions/result";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { parseBusinessDateInput } from "@/lib/finance/tips";
import { runTipsDistributionForManager } from "@/lib/data/tips";

export type DistributeTipsResult =
  | { ok: true; distributedToCount: number; totalTipsCollected: number }
  | { ok: false; error: string };

const MANAGER_TIPS_PATH = "/[lang]/settings/manager/tips";
const MOBILE_PATH = "/[lang]/calendar/mobile";

export async function distributeTipsAction(
  dateValue: string,
  totalTipsCollected: number,
): Promise<DistributeTipsResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const date = parseBusinessDateInput(dateValue);
    if (!date) return { ok: false, error: "invalid_date" };

    const result = await runTipsDistributionForManager({
      userId: user.id,
      userRole: user.role,
      date,
      totalTipsCollected,
    });

    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath(MANAGER_TIPS_PATH, "page");
    revalidatePath(MOBILE_PATH, "page");
    return {
      ok: true,
      distributedToCount: result.distributedToCount,
      totalTipsCollected: result.totalTipsCollected,
    };
  } catch (error) {
    return actionDatabaseError("tips", error);
  }
}
