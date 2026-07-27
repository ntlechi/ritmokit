"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import {
  findAvailableReplacementsForShift,
  type RejectionReason,
} from "@/lib/agents/find-available-replacements";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { logManagerReportedSickness, notifyEmployeeSicknessAck } from "@/lib/staffing/sickness";
import type { Locale } from "@/lib/i18n/config";

const MANAGER_SCHEDULE_PATH = "/[lang]/calendar/manager/schedule";
const WEEK_PATH = "/[lang]/calendar/week";
const PUNCH_PATH = "/[lang]/pointeuse";
const ASSIDUITY_PATH = "/[lang]/settings/manager/assiduity";

const REPORTABLE_STATUSES = ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] as const;

export type TriggerStaffSicknessResult =
  | {
      ok: true;
      shiftId: string;
      candidates: { userId: string; fullName: string; profilePictureUrl: string | null }[];
      rejections: {
        userId: string;
        fullName: string;
        profilePictureUrl: string | null;
        reason: RejectionReason;
      }[];
      scanned: number;
    }
  | { ok: false; error: string };

function isShiftTodayInToronto(startsAt: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(startsAt) === fmt.format(new Date());
}

function revalidateSicknessPaths() {
  revalidatePath(MANAGER_SCHEDULE_PATH, "page");
  revalidatePath(WEEK_PATH, "page");
  revalidatePath(PUNCH_PATH, "page");
  revalidatePath(ASSIDUITY_PATH, "page");
  revalidatePath("/[lang]/calendar/mobile", "page");
}

/**
 * Signalement maladie en 1 geste : CRISIS_ALERT + journal assiduité + ack employé,
 * puis retourne le scan de remplaçants pour ouvrir immédiatement le tiroir Express.
 */
export async function triggerStaffSicknessAction(
  shiftId: string,
  lang: Locale,
): Promise<TriggerStaffSicknessResult> {
  try {
    const manager = await getSessionUser();
    if (!manager || !canAccessManagerSettings(manager.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { employee: { select: { id: true, fullName: true } } },
    });
    if (!shift) return { ok: false, error: "shift_not_found" };
    if (!shift.employeeId || !shift.employee) return { ok: false, error: "no_employee_assigned" };
    if (!REPORTABLE_STATUSES.includes(shift.status as (typeof REPORTABLE_STATUSES)[number])) {
      return { ok: false, error: "invalid_shift_status" };
    }
    if (!isShiftTodayInToronto(shift.startsAt)) {
      return { ok: false, error: "not_today" };
    }

    const membership = await prisma.locationMember.findFirst({
      where: { userId: manager.id, locationId: shift.locationId },
    });
    if (!membership) return { ok: false, error: "unauthorized" };

    const sickEmployeeId = shift.employeeId;
    const sickEmployeeName = shift.employee.fullName;

    await prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: "CRISIS_ALERT",
        notes: shift.notes
          ? `${shift.notes}\n[Maladie signalée par gérant — ${new Date().toISOString()}]`
          : "Maladie signalée par le gérant",
      },
    });

    await Promise.all([
      logManagerReportedSickness({
        shiftId,
        locationId: shift.locationId,
        employeeId: sickEmployeeId,
        startsAt: shift.startsAt,
        reportedByUserId: manager.id,
      }),
      notifyEmployeeSicknessAck({
        shiftId,
        locationId: shift.locationId,
        stationId: shift.stationId,
        employeeId: sickEmployeeId,
        employeeName: sickEmployeeName,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        managerId: manager.id,
        lang,
      }),
    ]);

    const updatedShift = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
    const scan = await findAvailableReplacementsForShift(updatedShift);

    revalidateSicknessPaths();

    return {
      ok: true,
      shiftId,
      candidates: scan.candidates.map((c) => ({
        userId: c.userId,
        fullName: c.fullName,
        profilePictureUrl: c.profilePictureUrl,
      })),
      rejections: scan.rejections,
      scanned: scan.scanned,
    };
  } catch (error) {
    return actionDatabaseError("sickness", error);
  }
}
