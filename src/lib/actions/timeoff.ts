"use server";

import { revalidatePath } from "next/cache";
import type { RequestStatus } from "@/generated/prisma/enums";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type TimeOffActionResult = { ok: true } | { ok: false; error: string };

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function requestTimeOff(input: {
  lang: string;
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<TimeOffActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };

    const startDate = parseDateOnly(input.startDate);
    const endDate = parseDateOnly(input.endDate);
    if (!startDate || !endDate) return { ok: false, error: "missing_fields" };
    if (startDate < startOfToday()) return { ok: false, error: "past_date_invalid" };
    if (endDate < startDate) return { ok: false, error: "invalid_range" };

    const profile = await prisma.employeeProfile.findUnique({
      where: { userId: sessionUser.id },
    });
    if (!profile) return { ok: false, error: "profile_not_found" };

    await prisma.timeOffRequest.create({
      data: {
        profileId: profile.id,
        startDate,
        endDate,
        reason: input.reason?.trim() || null,
      },
    });

    revalidatePath(`/${input.lang}/settings/availability`, "page");
    revalidatePath(`/${input.lang}/team/requests`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("timeoff", error);
  }
}

export async function reviewTimeOffRequest(input: {
  lang: string;
  requestId: string;
  status: Extract<RequestStatus, "APPROVED" | "REJECTED">;
}): Promise<TimeOffActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };
    if (!canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const existing = await prisma.timeOffRequest.findUnique({
      where: { id: input.requestId },
      select: {
        status: true,
        profile: { select: { userId: true } },
      },
    });
    if (!existing) return { ok: false, error: "database_error" };
    if (existing.status !== "PENDING") return { ok: false, error: "already_reviewed" };

    // Managers may only review employees who share a location membership.
    if (sessionUser.role !== "ADMIN") {
      const reviewerLocations = await prisma.locationMember.findMany({
        where: { userId: sessionUser.id },
        select: { locationId: true },
      });
      const locationIds = reviewerLocations.map((m) => m.locationId);
      if (locationIds.length === 0) return { ok: false, error: "unauthorized" };

      const shared = await prisma.locationMember.findFirst({
        where: {
          userId: existing.profile.userId,
          locationId: { in: locationIds },
        },
        select: { id: true },
      });
      if (!shared) return { ok: false, error: "unauthorized" };
    }

    await prisma.timeOffRequest.update({
      where: { id: input.requestId },
      data: {
        status: input.status,
        reviewedById: sessionUser.id,
        reviewedAt: new Date(),
      },
    });

    revalidatePath(`/${input.lang}/team/requests`, "page");
    revalidatePath(`/${input.lang}/team`, "page");
    revalidatePath(`/${input.lang}/settings/availability`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("timeoff", error);
  }
}
