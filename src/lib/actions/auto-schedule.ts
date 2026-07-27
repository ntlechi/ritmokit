"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { generateDraftScheduleForWeek, type DraftGenerationSummary } from "@/lib/scheduling/auto-schedule";

export type AutoScheduleActionResult =
  | { ok: true; summary: DraftGenerationSummary }
  | { ok: false; error: string };

export type PublishScheduleActionResult =
  | { ok: true; publishedCount: number; blockedCount: number }
  | { ok: false; error: string };

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

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

export async function generateAutoScheduleAction(input: {
  weekStartIso: string;
}): Promise<AutoScheduleActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerLocation(user.id);
    if (!membership) return { ok: false, error: "no_location" };

    const weekStart = new Date(input.weekStartIso);
    if (Number.isNaN(weekStart.getTime())) return { ok: false, error: "invalid_date" };

    const summary = await generateDraftScheduleForWeek({
      locationId: membership.locationId,
      weekStart,
      createdById: user.id,
    });

    revalidateCalendarPaths();
    return { ok: true, summary };
  } catch (error) {
    return actionDatabaseError("auto-schedule", error);
  }
}

export async function publishDraftShiftsAction(input: {
  weekStartIso: string;
}): Promise<PublishScheduleActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerLocation(user.id);
    if (!membership) return { ok: false, error: "no_location" };

    const weekStart = new Date(input.weekStartIso);
    if (Number.isNaN(weekStart.getTime())) return { ok: false, error: "invalid_date" };
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const draftShifts = await prisma.shift.findMany({
      where: {
        locationId: membership.locationId,
        status: "DRAFT",
        employeeId: { not: null },
        startsAt: { gte: weekStart, lt: weekEnd },
      },
      select: { id: true },
    });

    let publishedCount = 0;
    let blockedCount = 0;
    const now = new Date();

    for (const shift of draftShifts) {
      try {
        await prisma.shift.update({
          where: { id: shift.id },
          data: { status: "PUBLISHED", publishedAt: now },
        });
        publishedCount += 1;
      } catch {
        // Bloqué par le trigger CNESST (repos 32h) — reste en DRAFT pour ajustement manuel.
        blockedCount += 1;
      }
    }

    if (publishedCount > 0) {
      const announcements = await prisma.chatChannel.findUnique({
        where: { locationId_slug: { locationId: membership.locationId, slug: "annonces" } },
      });
      if (announcements) {
        const dateLabel = weekStart.toLocaleDateString("fr-CA", { timeZone: "America/Toronto" });
        await prisma.chatMessage.create({
          data: {
            channelId: announcements.id,
            authorId: user.id,
            contentType: "TEXT",
            body: `📅 Horaire publié pour la semaine du ${dateLabel} — ${publishedCount} quart(s) confirmé(s). Consultez vos quarts dans l'app.`,
            metadata: { intent: "schedule_published", weekStart: weekStart.toISOString(), publishedCount },
          },
        });
      }
    }

    revalidateCalendarPaths();
    return { ok: true, publishedCount, blockedCount };
  } catch (error) {
    return actionDatabaseError("auto-schedule", error);
  }
}

export async function deleteDraftShiftAction(shiftId: string): Promise<SimpleActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerLocation(user.id);
    if (!membership && user.role !== "ADMIN") {
      return { ok: false, error: "unauthorized" };
    }

    const deleted = await prisma.shift.deleteMany({
      where: {
        id: shiftId,
        status: "DRAFT",
        ...(user.role === "ADMIN" || !membership
          ? {}
          : { locationId: membership.locationId }),
      },
    });
    if (deleted.count === 0) return { ok: false, error: "not_draft" };

    revalidateCalendarPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("auto-schedule", error);
  }
}

/** @deprecated Prefer `reassignShiftAction` in `@/lib/actions/shifts` (supports day move + unassign). */
export async function assignDraftShiftAction(input: {
  shiftId: string;
  employeeId: string | null;
}): Promise<SimpleActionResult> {
  const { reassignShiftAction } = await import("@/lib/actions/shifts");
  const shift = await prisma.shift.findUnique({
    where: { id: input.shiftId },
    select: { startsAt: true, endsAt: true },
  });
  if (!shift) return { ok: false, error: "not_draft" };

  const result = await reassignShiftAction({
    shiftId: input.shiftId,
    employeeId: input.employeeId,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
