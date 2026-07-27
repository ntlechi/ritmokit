import "server-only";

import type { ReviewStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export const REVIEW_CYCLE_DAYS = 90;

export function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Ancre d'embauche : hiredAt LocationMember → EmployeeProfile → createdAt User. */
export async function resolveHireAnchor(userId: string, locationId: string): Promise<Date> {
  const member = await prisma.locationMember.findUnique({
    where: { locationId_userId: { locationId, userId } },
    select: { hiredAt: true, createdAt: true },
  });
  if (member?.hiredAt) return startOfUtcDay(member.hiredAt);

  const profile = await prisma.employeeProfile.findUnique({
    where: { userId },
    select: { hiredAt: true, createdAt: true },
  });
  if (profile?.hiredAt) return startOfUtcDay(profile.hiredAt);
  if (profile?.createdAt) return startOfUtcDay(profile.createdAt);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  return startOfUtcDay(user?.createdAt ?? new Date());
}

/**
 * Calcule la prochaine date de fin de période (J+90, J+180…) due aujourd'hui ou avant.
 * Retourne null si le prochain bilan n'est pas encore dû.
 */
export function computeDuePeriodEnd(hireAnchor: Date, today: Date = new Date()): Date | null {
  const todayUtc = startOfUtcDay(today);
  let periodEnd = addUtcDays(hireAnchor, REVIEW_CYCLE_DAYS);
  let guard = 0;
  while (periodEnd < todayUtc && guard < 40) {
    periodEnd = addUtcDays(periodEnd, REVIEW_CYCLE_DAYS);
    guard += 1;
  }
  // Dû si periodEnd <= today (le cycle est atteint)
  if (periodEnd > todayUtc) {
    // Vérifier si le cycle précédent était dû et non créé — on génère le cycle courant seulement s'il est atteint
    const previous = addUtcDays(periodEnd, -REVIEW_CYCLE_DAYS);
    if (previous >= hireAnchor && previous <= todayUtc) {
      return previous;
    }
    return null;
  }
  return periodEnd;
}

export async function aggregateFeedbackForPeriod(input: {
  employeeId: string;
  locationId: string;
  periodEnd: Date;
  windowDays?: number;
}) {
  const windowDays = input.windowDays ?? REVIEW_CYCLE_DAYS;
  const periodEnd = startOfUtcDay(input.periodEnd);
  const periodStart = addUtcDays(periodEnd, -windowDays);

  const rows = await prisma.shiftFeedback.findMany({
    where: {
      employeeId: input.employeeId,
      createdAt: { gte: periodStart, lte: addUtcDays(periodEnd, 1) },
      shift: { locationId: input.locationId },
    },
    select: {
      ratingAttitude: true,
      ratingSpeed: true,
      ratingReliability: true,
    },
  });

  if (rows.length === 0) {
    return {
      count: 0,
      attitude: null as number | null,
      speed: null as number | null,
      reliability: null as number | null,
      overall: null as number | null,
    };
  }

  const n = rows.length;
  const sumA = rows.reduce((s, r) => s + r.ratingAttitude, 0);
  const sumS = rows.reduce((s, r) => s + r.ratingSpeed, 0);
  const sumR = rows.reduce((s, r) => s + r.ratingReliability, 0);

  return {
    count: n,
    attitude: Number((sumA / n).toFixed(2)),
    speed: Number((sumS / n).toFixed(2)),
    reliability: Number((sumR / n).toFixed(2)),
    overall: Number(((sumA + sumS + sumR) / (n * 3)).toFixed(2)),
  };
}

/**
 * Crée les bilans dus pour tous les employés d'une succursale (idempotent).
 */
export async function ensureDueReviewsForLocation(locationId: string): Promise<number> {
  const members = await prisma.locationMember.findMany({
    where: { locationId, user: { role: "EMPLOYEE" } },
    select: { userId: true },
  });

  let created = 0;
  const today = new Date();

  for (const member of members) {
    const hireAnchor = await resolveHireAnchor(member.userId, locationId);
    const periodEnd = computeDuePeriodEnd(hireAnchor, today);
    if (!periodEnd) continue;

    const existing = await prisma.quarterlyReview.findUnique({
      where: {
        locationId_employeeId_periodEndDate: {
          locationId,
          employeeId: member.userId,
          periodEndDate: periodEnd,
        },
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.quarterlyReview.create({
      data: {
        locationId,
        employeeId: member.userId,
        periodEndDate: periodEnd,
        status: "PENDING_SELF_EVALUATION" satisfies ReviewStatus,
      },
    });
    created += 1;
  }

  return created;
}
