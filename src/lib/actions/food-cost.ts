"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type FoodCostActionResult = { ok: true } | { ok: false; error: string };

const MIN_FOOD_COST = 0;
const MAX_FOOD_COST = 100;

export async function updateFoodCostPctAction(input: {
  lang: string;
  foodCostPct: number;
}): Promise<FoodCostActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const pct = Number(input.foodCostPct);
    if (!Number.isFinite(pct) || pct < MIN_FOOD_COST || pct > MAX_FOOD_COST) {
      return { ok: false, error: "invalid_value" };
    }

    const membership = await prisma.locationMember.findFirst({
      where: { userId: user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { locationId: true },
    });
    if (!membership) return { ok: false, error: "not_found" };

    await prisma.location.update({
      where: { id: membership.locationId },
      data: { foodCostPct: Math.round(pct * 100) / 100 },
    });

    revalidatePath(`/${input.lang}/settings/manager/food-cost`, "page");
    revalidatePath(`/${input.lang}/dashboard`, "page");
    revalidatePath("/[lang]/dashboard", "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("food-cost", error);
  }
}
