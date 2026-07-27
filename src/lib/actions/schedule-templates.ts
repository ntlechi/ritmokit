"use server";

import { revalidatePath } from "next/cache";
import type { ShiftPeriod } from "@/generated/prisma/enums";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { hasBatchShiftConflict, hasEmployeeShiftConflict } from "@/lib/scheduling/overlap";

export type TemplateActionResult =
  | { ok: true; templateId: string; shiftCount: number }
  | { ok: false; error: string };

export type ApplyTemplateResult =
  | { ok: true; createdCount: number; assignedCount: number; unassignedCount: number }
  | { ok: false; error: string };

export type SimpleTemplateResult = { ok: true } | { ok: false; error: string };

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

async function resolveManagerLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true },
  });
}

function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function dayOfWeekSunday0(date: Date): number {
  return date.getDay(); // 0 = Sunday … 6 = Saturday
}

function buildShiftTimes(weekStart: Date, dayOfWeek: number, startMinutes: number, durationMinutes: number) {
  const day = new Date(weekStart);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + dayOfWeek);
  const startsAt = new Date(day);
  startsAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { startsAt, endsAt };
}

/**
 * Capture la semaine courante (DRAFT + PUBLISHED + CONFIRMED…) en modèle réutilisable.
 * Les horaires sont stockés en relatif (jour de semaine + minutes).
 */
export async function saveWeekAsTemplateAction(input: {
  weekStartIso: string;
  name: string;
  description?: string;
}): Promise<TemplateActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const name = input.name.trim().slice(0, 80);
    if (!name) return { ok: false, error: "name_required" };

    const membership = await resolveManagerLocation(user.id);
    if (!membership) return { ok: false, error: "no_location" };

    const weekStart = new Date(input.weekStartIso);
    if (Number.isNaN(weekStart.getTime())) return { ok: false, error: "invalid_date" };
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const sourceShifts = await prisma.shift.findMany({
      where: {
        locationId: membership.locationId,
        startsAt: { gte: weekStart, lt: weekEnd },
        status: { in: ["DRAFT", "PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] },
      },
      select: {
        startsAt: true,
        endsAt: true,
        stationId: true,
        period: true,
        employeeId: true,
      },
      orderBy: [{ startsAt: "asc" }],
    });

    if (sourceShifts.length === 0) return { ok: false, error: "no_shifts" };

    const template = await prisma.scheduleTemplate.create({
      data: {
        locationId: membership.locationId,
        name,
        description: input.description?.trim().slice(0, 200) || null,
        createdById: user.id,
        shifts: {
          create: sourceShifts.map((shift, index) => {
            const durationMs = shift.endsAt.getTime() - shift.startsAt.getTime();
            const durationMinutes = Math.max(15, Math.round(durationMs / 60_000));
            return {
              dayOfWeek: dayOfWeekSunday0(shift.startsAt),
              startMinutes: minutesFromMidnight(shift.startsAt),
              durationMinutes,
              stationId: shift.stationId,
              period: shift.period,
              employeeId: shift.employeeId,
              sortOrder: index,
            };
          }),
        },
      },
      select: { id: true, _count: { select: { shifts: true } } },
    });

    revalidateCalendarPaths();
    return { ok: true, templateId: template.id, shiftCount: template._count.shifts };
  } catch (error) {
    return actionDatabaseError("schedule-templates", error);
  }
}

/**
 * Applique un modèle sur une semaine cible en créant des quarts DRAFT.
 * Remplace uniquement les brouillons auto-générés de la semaine (comme Auto-Planif).
 */
export async function applyScheduleTemplateAction(input: {
  templateId: string;
  weekStartIso: string;
  replaceAutoDrafts?: boolean;
}): Promise<ApplyTemplateResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerLocation(user.id);
    if (!membership) return { ok: false, error: "no_location" };

    const weekStart = new Date(input.weekStartIso);
    if (Number.isNaN(weekStart.getTime())) return { ok: false, error: "invalid_date" };
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const template = await prisma.scheduleTemplate.findFirst({
      where: { id: input.templateId, locationId: membership.locationId },
      include: { shifts: { orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }, { sortOrder: "asc" }] } },
    });
    if (!template) return { ok: false, error: "template_not_found" };
    if (template.shifts.length === 0) return { ok: false, error: "empty_template" };

    const stationIds = [...new Set(template.shifts.map((s) => s.stationId))];
    const validStations = await prisma.station.findMany({
      where: { locationId: membership.locationId, id: { in: stationIds }, isActive: true },
      select: { id: true },
    });
    const validStationSet = new Set(validStations.map((s) => s.id));

    const preferredEmployeeIds = [
      ...new Set(template.shifts.map((s) => s.employeeId).filter((id): id is string => Boolean(id))),
    ];
    const stillMembers =
      preferredEmployeeIds.length > 0
        ? await prisma.locationMember.findMany({
            where: {
              locationId: membership.locationId,
              userId: { in: preferredEmployeeIds },
            },
            select: { userId: true },
          })
        : [];
    const memberSet = new Set(stillMembers.map((m) => m.userId));

    const replaceAuto = input.replaceAutoDrafts !== false;
    if (replaceAuto) {
      await prisma.shift.deleteMany({
        where: {
          locationId: membership.locationId,
          status: "DRAFT",
          isAutoGenerated: true,
          startsAt: { gte: weekStart, lt: weekEnd },
        },
      });
    }

    const rows: {
      locationId: string;
      stationId: string;
      period: ShiftPeriod;
      employeeId: string | null;
      createdById: string;
      startsAt: Date;
      endsAt: Date;
      status: "DRAFT";
      isAutoGenerated: boolean;
    }[] = [];

    for (const slot of template.shifts) {
      if (!validStationSet.has(slot.stationId)) continue;
      const { startsAt, endsAt } = buildShiftTimes(
        weekStart,
        slot.dayOfWeek,
        slot.startMinutes,
        slot.durationMinutes,
      );
      let employeeId =
        slot.employeeId && memberSet.has(slot.employeeId) ? slot.employeeId : null;

      if (employeeId) {
        const batchConflict = hasBatchShiftConflict(rows, {
          employeeId,
          startsAt,
          endsAt,
        });
        const dbConflict = await hasEmployeeShiftConflict(employeeId, startsAt, endsAt);
        if (batchConflict || dbConflict) {
          // Keep the draft slot but leave it unassigned rather than double-booking.
          employeeId = null;
        }
      }

      rows.push({
        locationId: membership.locationId,
        stationId: slot.stationId,
        period: slot.period,
        employeeId,
        createdById: user.id,
        startsAt,
        endsAt,
        status: "DRAFT",
        isAutoGenerated: true,
      });
    }

    if (rows.length === 0) return { ok: false, error: "empty_template" };

    try {
      await prisma.shift.createMany({ data: rows });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("shifts_employee_no_overlap") || message.includes("chevauchement")) {
        return { ok: false, error: "shift_conflict" };
      }
      throw error;
    }

    const assignedCount = rows.filter((r) => r.employeeId).length;
    revalidateCalendarPaths();
    return {
      ok: true,
      createdCount: rows.length,
      assignedCount,
      unassignedCount: rows.length - assignedCount,
    };
  } catch (error) {
    return actionDatabaseError("schedule-templates", error);
  }
}

export async function deleteScheduleTemplateAction(templateId: string): Promise<SimpleTemplateResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerLocation(user.id);
    if (!membership) return { ok: false, error: "no_location" };

    const template = await prisma.scheduleTemplate.findFirst({
      where: { id: templateId, locationId: membership.locationId },
      select: { id: true },
    });
    if (!template) return { ok: false, error: "template_not_found" };

    await prisma.scheduleTemplate.delete({ where: { id: templateId } });
    revalidateCalendarPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("schedule-templates", error);
  }
}
