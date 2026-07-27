"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import {
  clockInForUser,
  clockOutForUser,
  type PunchCoords,
  type PunchCoreResult,
} from "@/lib/punch/core";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type PunchActionResult = PunchCoreResult;

const PUNCH_PATH = "/[lang]/pointeuse";

export async function clockInAction(shiftId: string, coords?: PunchCoords): Promise<PunchActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const result = await clockInForUser(
      user.id,
      shiftId,
      user.role,
      coords ? { kind: "geofence", coords } : undefined,
    );
    if (result.ok) revalidatePath(PUNCH_PATH, "page");
    return result;
  } catch (error) {
    return actionDatabaseError("punch", error);
  }
}

export async function clockOutAction(shiftId: string): Promise<PunchActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const result = await clockOutForUser(user.id, shiftId);
    if (result.ok) revalidatePath(PUNCH_PATH, "page");
    return result;
  } catch (error) {
    return actionDatabaseError("punch", error);
  }
}

export async function startBreakAction(shiftId: string): Promise<PunchActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return { ok: false, error: "shift_not_found" };
    if (shift.employeeId !== user.id) return { ok: false, error: "unauthorized" };
    if (!shift.actualStartsAt) return { ok: false, error: "not_clocked_in" };
    if (shift.actualEndsAt) return { ok: false, error: "already_clocked_out" };
    if (shift.breakStartedAt && !shift.breakEndedAt) return { ok: false, error: "break_already_active" };

    await prisma.shift.update({
      where: { id: shiftId },
      data: { breakStartedAt: new Date(), breakEndedAt: null },
    });
    revalidatePath(PUNCH_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("punch", error);
  }
}

export async function endBreakAction(shiftId: string): Promise<PunchActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return { ok: false, error: "shift_not_found" };
    if (shift.employeeId !== user.id) return { ok: false, error: "unauthorized" };
    if (!shift.breakStartedAt || shift.breakEndedAt) return { ok: false, error: "no_active_break" };

    await prisma.shift.update({ where: { id: shiftId }, data: { breakEndedAt: new Date() } });
    revalidatePath(PUNCH_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("punch", error);
  }
}
