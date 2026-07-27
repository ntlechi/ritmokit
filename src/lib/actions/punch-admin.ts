"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

const PUNCHES_PATH = "/[lang]/settings/manager/punches";

export type CorrectPunchResult = { ok: true } | { ok: false; error: string };

type PunchPatch = {
  actualStartsAt: string | null;
  actualEndsAt: string | null;
};

function parseOrNull(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function correctPunchAction(shiftId: string, patch: PunchPatch): Promise<CorrectPunchResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };
    if (!canAccessManagerSettings(user.role)) return { ok: false, error: "unauthorized" };

    const membership = await prisma.locationMember.findFirst({
      where: { userId: user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    if (!membership) return { ok: false, error: "unauthorized" };

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        id: true,
        locationId: true,
        employeeId: true,
        actualStartsAt: true,
        actualEndsAt: true,
      },
    });
    if (!shift || shift.locationId !== membership.locationId) {
      return { ok: false, error: "shift_not_found" };
    }

    const nextStart = parseOrNull(patch.actualStartsAt);
    const nextEnd = parseOrNull(patch.actualEndsAt);
    if (nextStart === undefined || nextEnd === undefined) {
      return { ok: false, error: "invalid_date" };
    }
    if (nextStart && nextEnd && nextEnd.getTime() < nextStart.getTime()) {
      return { ok: false, error: "invalid_range" };
    }

    await prisma.$transaction([
      prisma.shift.update({
        where: { id: shiftId },
        data: { actualStartsAt: nextStart, actualEndsAt: nextEnd },
      }),
      prisma.agentLog.create({
        data: {
          channel: "agent:punch_correction",
          eventType: "shift.punch_corrected",
          relatedShiftId: shiftId,
          status: "SUCCEEDED",
          payload: {
            auditType: "manual_punch_correction",
            managerId: user.id,
            managerName: user.fullName,
            employeeId: shift.employeeId,
            locationId: shift.locationId,
            before: {
              actualStartsAt: shift.actualStartsAt?.toISOString() ?? null,
              actualEndsAt: shift.actualEndsAt?.toISOString() ?? null,
            },
            after: {
              actualStartsAt: nextStart?.toISOString() ?? null,
              actualEndsAt: nextEnd?.toISOString() ?? null,
            },
          },
        },
      }),
    ]);

    revalidatePath(PUNCHES_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("punch-admin", error);
  }
}
