/**
 * 48h priority seat for a student tagged ready for the next level.
 * Occupies Lead/Follow capacity so the public site cannot sell the spot first.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import type { DanceRole } from "@/generated/prisma/enums";
import { evaluateParityEnrollment } from "@/lib/dance/parity";
import { nextCourseLevel } from "@/lib/dance/progression";
import { resolveEnrollmentAmountCad } from "@/lib/dance/pricing";
import { asPlainNumber } from "@/lib/data/serialize";
import { ticketCodeForEnrollment } from "@/lib/payments/interac-status";
import { loadSessionCapacity } from "@/lib/public-api/capacity";
import { prisma } from "@/lib/prisma";

export const VIP_HOLD_PREFIX = "rk-vip-hold:";
export const VIP_HOLD_HOURS = 48;

export type VipHoldResult = {
  held: boolean;
  waitlisted: boolean;
  enrollmentId?: string;
  courseTitle?: string;
  seasonName?: string;
  expiresAt?: Date;
};

export function vipHoldPaymentRef(progressionId: string): string {
  return `${VIP_HOLD_PREFIX}${progressionId}`;
}

export function vipHoldExpiresAt(startedAt: Date, hours = VIP_HOLD_HOURS): Date {
  return new Date(startedAt.getTime() + hours * 60 * 60 * 1000);
}

export async function holdNextLevelSeat(progressionId: string): Promise<VipHoldResult> {
  const row = await prisma.studentProgression.findUnique({
    where: { id: progressionId },
    select: {
      id: true,
      studentId: true,
      locationId: true,
      danceStyle: true,
      currentLevel: true,
      danceRole: true,
      season: { select: { startsOn: true } },
      student: { select: { fullName: true } },
    },
  });
  if (!row) return { held: false, waitlisted: false };

  const nextLevel = nextCourseLevel(row.currentLevel);
  if (!nextLevel) return { held: false, waitlisted: false };

  const existingHold = await prisma.enrollment.findFirst({
    where: {
      studentId: row.studentId,
      paymentRef: vipHoldPaymentRef(row.id),
      paymentStatus: { not: "CANCELLED_INTERAC" },
    },
    select: {
      id: true,
      waitlisted: true,
      paymentPendingAt: true,
      session: { select: { course: { select: { title: true } }, season: { select: { name: true } } } },
    },
  });
  if (existingHold) {
    const started = existingHold.paymentPendingAt ?? new Date();
    return {
      held: !existingHold.waitlisted,
      waitlisted: existingHold.waitlisted,
      enrollmentId: existingHold.id,
      courseTitle: existingHold.session.course.title,
      seasonName: existingHold.session.season?.name,
      expiresAt: vipHoldExpiresAt(started),
    };
  }

  const nextSeason = await prisma.sessionSeason.findFirst({
    where: {
      locationId: row.locationId,
      startsOn: { gt: row.season.startsOn },
      status: { in: ["ACTIVE", "DRAFT"] },
    },
    orderBy: { startsOn: "asc" },
    select: { id: true, name: true },
  });
  if (!nextSeason) return { held: false, waitlisted: false };

  const currentEnrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: row.studentId,
      waitlisted: false,
      paymentStatus: { not: "CANCELLED_INTERAC" },
      session: { seasonId: { not: null }, course: { style: row.danceStyle } },
    },
    orderBy: { createdAt: "desc" },
    select: { danceRole: true, session: { select: { dayOfWeek: true } } },
  });

  const role: DanceRole = row.danceRole ?? currentEnrollment?.danceRole ?? "SOLO";
  const preferredDay = currentEnrollment?.session.dayOfWeek ?? null;

  const candidates = await prisma.classSession.findMany({
    where: {
      seasonId: nextSeason.id,
      course: { style: row.danceStyle, level: nextLevel },
    },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      priceRegular: true,
      priceCouple: true,
      priceStudent: true,
      course: { select: { title: true } },
    },
    orderBy: { startTime: "asc" },
    take: 12,
  });
  if (candidates.length === 0) return { held: false, waitlisted: false };

  const session =
    (preferredDay != null ? candidates.find((c) => c.dayOfWeek === preferredDay) : undefined) ??
    candidates[0]!;

  const already = await prisma.enrollment.findUnique({
    where: { sessionId_studentId: { sessionId: session.id, studentId: row.studentId } },
    select: {
      id: true,
      paid: true,
      waitlisted: true,
      paymentStatus: true,
      paymentPendingAt: true,
    },
  });

  const now = new Date();
  const expiresAt = vipHoldExpiresAt(now);
  const amountCad = resolveEnrollmentAmountCad(
    {
      priceRegular: asPlainNumber(session.priceRegular),
      priceCouple: session.priceCouple != null ? asPlainNumber(session.priceCouple) : null,
      priceStudent: session.priceStudent != null ? asPlainNumber(session.priceStudent) : null,
    },
    "REGULAR",
  );
  const hint = `VIP ${VIP_HOLD_HOURS}h · ${row.student.fullName} · ${session.course.title}`;
  const paymentRef = vipHoldPaymentRef(row.id);

  if (already && already.paymentStatus !== "CANCELLED_INTERAC") {
    if (!already.paid) {
      await prisma.enrollment.update({
        where: { id: already.id },
        data: {
          paymentRef,
          paymentPendingAt: already.paymentPendingAt ?? now,
          interacReferenceHint: hint,
        },
      });
    }
    return {
      held: !already.waitlisted,
      waitlisted: already.waitlisted,
      enrollmentId: already.id,
      courseTitle: session.course.title,
      seasonName: nextSeason.name,
      expiresAt: already.paid ? undefined : expiresAt,
    };
  }

  const capacity = await loadSessionCapacity(session.id);
  if (!capacity) return { held: false, waitlisted: false };
  const decision = evaluateParityEnrollment(capacity, role, { allowWaitlist: true });
  if (!decision.ok) return { held: false, waitlisted: false };

  const enrollmentId = already?.id ?? randomUUID();
  const waitlistedAt = decision.waitlisted ? new Date("2000-01-01T00:00:00.000Z") : null;

  const data = {
    sessionId: session.id,
    studentId: row.studentId,
    danceRole: role,
    waitlisted: decision.waitlisted,
    waitlistedAt,
    paid: false,
    paymentStatus: "NONE" as const,
    paymentProvider: null,
    pricingTier: "REGULAR" as const,
    amountCad,
    currency: "CAD",
    paymentRef,
    paymentPendingAt: now,
    ticketCode: ticketCodeForEnrollment(enrollmentId),
    interacReferenceHint: hint,
    cancellationReason: null,
    paymentCancelledAt: null,
    paymentCancelledById: null,
  };

  if (already) {
    await prisma.enrollment.update({ where: { id: enrollmentId }, data });
  } else {
    await prisma.enrollment.create({ data: { id: enrollmentId, ...data } });
  }

  return {
    held: !decision.waitlisted,
    waitlisted: decision.waitlisted,
    enrollmentId,
    courseTitle: session.course.title,
    seasonName: nextSeason.name,
    expiresAt,
  };
}

export async function releaseExpiredVipHolds(now = new Date()): Promise<{ released: number }> {
  const cutoff = new Date(now.getTime() - VIP_HOLD_HOURS * 60 * 60 * 1000);
  const rows = await prisma.enrollment.findMany({
    where: {
      paid: false,
      paymentRef: { startsWith: VIP_HOLD_PREFIX },
      paymentStatus: { not: "CANCELLED_INTERAC" },
      paymentPendingAt: { lte: cutoff },
    },
    select: { id: true },
    take: 80,
  });

  if (rows.length === 0) return { released: 0 };

  await prisma.enrollment.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: {
      paymentStatus: "CANCELLED_INTERAC",
      waitlisted: false,
      paymentCancelledAt: now,
      cancellationReason: "vip_hold_expired",
    },
  });

  return { released: rows.length };
}
