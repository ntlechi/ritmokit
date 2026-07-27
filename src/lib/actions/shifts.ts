"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@/generated/prisma/enums";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { actionErrorFromUnknown } from "@/lib/actions/result";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import { hasEmployeeShiftConflict } from "@/lib/scheduling/overlap";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ReassignDraftResult =
  | {
      ok: true;
      overtimeFlag: boolean;
      restViolationFlag: boolean;
      weeklyHoursSnapshot: number;
    }
  | { ok: false; error: string };

const CALENDAR_PATHS = [
  "/[lang]/calendar/week",
  "/[lang]/calendar/month",
  "/[lang]/calendar/day",
  "/[lang]/calendar/mobile",
  "/[lang]/calendar/manager/schedule",
];

function revalidateCalendarPaths() {
  for (const path of CALENDAR_PATHS) revalidatePath(path, "page");
}

/**
 * The CNESST trigger (`enforce_cnesst_rules`) raises a Postgres exception
 * prefixed "CNESST:" when a shift is published/confirmed in violation of
 * the mandatory 32h rest rule. Every mutation below surfaces that message
 * to the UI instead of letting it bubble up as an unhandled 500.
 */
function toActionResult(error: unknown): ActionResult {
  return actionErrorFromUnknown("shifts", error);
}

function toReassignResult(error: unknown): ReassignDraftResult {
  return actionErrorFromUnknown("shifts.reassign", error);
}

async function resolveManagerLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true },
  });
}

/** Employee owns the shift, or a manager/admin of that location may act. */
async function assertCanMutateShift(
  shiftId: string,
  userId: string,
  role: Role,
): Promise<{ ok: true; locationId: string } | { ok: false; error: string }> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, employeeId: true, locationId: true },
  });
  if (!shift) return { ok: false, error: "shift_not_found" };

  if (shift.employeeId === userId) {
    return { ok: true, locationId: shift.locationId };
  }

  if (!canAccessManagerSettings(role)) {
    return { ok: false, error: "unauthorized" };
  }

  if (role === "ADMIN") {
    return { ok: true, locationId: shift.locationId };
  }

  const membership = await prisma.locationMember.findUnique({
    where: { locationId_userId: { locationId: shift.locationId, userId } },
    select: { locationId: true },
  });
  if (!membership) return { ok: false, error: "unauthorized" };
  return { ok: true, locationId: shift.locationId };
}

export async function confirmShiftAction(shiftId: string): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const updated = await prisma.shift.updateMany({
      where: {
        id: shiftId,
        employeeId: user.id,
        status: { in: ["PENDING_CONFIRMATION", "PUBLISHED"] },
      },
      data: { status: "CONFIRMED" },
    });
    if (updated.count === 0) return { ok: false, error: "unauthorized" };

    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function rejectShiftAction(shiftId: string): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    // Employee declines their assignment — CNESST trigger wakes Crisis Agent.
    const updated = await prisma.shift.updateMany({
      where: {
        id: shiftId,
        employeeId: user.id,
        status: { in: ["PENDING_CONFIRMATION", "PUBLISHED", "CONFIRMED"] },
      },
      data: { status: "REJECTED" },
    });
    if (updated.count === 0) return { ok: false, error: "unauthorized" };

    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/** Bouton Crise — même pipeline que REJECTED, statut explicite pour l'UI. */
export async function triggerCrisisAlertAction(shiftId: string): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const access = await assertCanMutateShift(shiftId, user.id, user.role);
    if (!access.ok) return access;

    const updated = await prisma.shift.updateMany({
      where: {
        id: shiftId,
        locationId: access.locationId,
        status: { notIn: ["DRAFT", "REJECTED"] },
      },
      data: { status: "CRISIS_ALERT" },
    });
    if (updated.count === 0) return { ok: false, error: "unauthorized" };

    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function requestSwapAction(shiftId: string, reason?: string): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true, employeeId: true },
    });
    if (!shift) return { ok: false, error: "shift_not_found" };
    if (shift.employeeId !== user.id) return { ok: false, error: "unauthorized" };

    await prisma.shiftSwapRequest.create({
      data: {
        shiftId,
        requestedById: user.id,
        status: "PENDING",
        reason,
      },
    });
    revalidatePath("/[lang]/calendar/mobile", "page");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Drag-and-drop reassignment for DRAFT (brouillon) shifts only.
 * Pass `employeeId: null` to return a shift to the orphan pool.
 */
export async function reassignShiftAction(input: {
  shiftId: string;
  employeeId: string | null;
  startsAt: Date;
  endsAt: Date;
}): Promise<ReassignDraftResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerLocation(user.id);
    if (!membership && user.role !== "ADMIN") return { ok: false, error: "unauthorized" };

    const shift = await prisma.shift.findUnique({
      where: { id: input.shiftId },
      select: { id: true, status: true, locationId: true },
    });
    if (!shift) return { ok: false, error: "shift_not_found" };
    if (user.role !== "ADMIN" && membership && shift.locationId !== membership.locationId) {
      return { ok: false, error: "unauthorized" };
    }
    if (shift.status !== "DRAFT") return { ok: false, error: "not_draft" };

    if (input.employeeId) {
      const employeeAtLocation = await prisma.locationMember.findFirst({
        where: {
          locationId: shift.locationId,
          userId: input.employeeId,
        },
        select: { userId: true },
      });
      if (!employeeAtLocation) return { ok: false, error: "employee_not_found" };
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return { ok: false, error: "invalid_date" };
    }

    if (input.employeeId) {
      const conflict = await hasEmployeeShiftConflict(
        input.employeeId,
        startsAt,
        endsAt,
        input.shiftId,
      );
      if (conflict) return { ok: false, error: "shift_conflict" };
    }

    const updated = await prisma.shift.update({
      where: { id: input.shiftId },
      data: {
        employeeId: input.employeeId,
        startsAt,
        endsAt,
      },
      select: {
        overtimeFlag: true,
        restViolationFlag: true,
        weeklyHoursSnapshot: true,
      },
    });

    revalidateCalendarPaths();
    return {
      ok: true,
      overtimeFlag: updated.overtimeFlag,
      restViolationFlag: updated.restViolationFlag,
      weeklyHoursSnapshot: asPlainNumber(updated.weeklyHoursSnapshot),
    };
  } catch (error) {
    return toReassignResult(error);
  }
}
