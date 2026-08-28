/**
 * Monday numbers an owner trusts — cash in, still waiting, unpaid seats, rentals.
 */
import "server-only";

import { asPlainNumber } from "@/lib/data/serialize";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import { prisma } from "@/lib/prisma";

export type OwnerPulse = {
  collectedCad: number;
  pendingInteracCad: number;
  unpaidSeatedCad: number;
  rentalCollectedCad: number;
  rentalPendingCad: number;
  studentCount: number;
  unpaidStudentCount: number;
  readyCount: number;
  churnCount: number;
};

function weekStartUtc(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const weekday = get("weekday");
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = dowMap[weekday] ?? 1;
  const daysFromMonday = (dow + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, d));
  start.setUTCDate(start.getUTCDate() - daysFromMonday);
  return start;
}

export async function loadOwnerPulse(
  locationId: string,
  timeZone = "America/Toronto",
  now = new Date(),
): Promise<OwnerPulse> {
  await ensureStudioOsSchema();
  const weekStart = weekStartUtc(now, timeZone);

  const enrollmentWhere = {
    paymentStatus: { not: "CANCELLED_INTERAC" as const },
    session: {
      OR: [{ season: { locationId } }, { room: { locationId }, seasonId: null }],
    },
  };

  const [paidWeek, pendingInterac, unpaidSeated, rentals, students, progressions] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        ...enrollmentWhere,
        paid: true,
        waitlisted: false,
        paidAt: { gte: weekStart },
      },
      select: { amountCad: true },
    }),
    prisma.enrollment.findMany({
      where: {
        ...enrollmentWhere,
        waitlisted: false,
        paymentStatus: "PENDING_INTERAC",
      },
      select: { amountCad: true },
    }),
    prisma.enrollment.findMany({
      where: {
        ...enrollmentWhere,
        waitlisted: false,
        paid: false,
        paymentStatus: { notIn: ["PENDING_INTERAC", "CANCELLED_INTERAC"] },
      },
      select: { amountCad: true, studentId: true },
    }),
    prisma.rentalBooking.findMany({
      where: {
        locationId,
        status: { not: "CANCELLED" },
      },
      select: { paymentStatus: true, priceCents: true, confirmedAt: true, createdAt: true },
    }),
    prisma.enrollment.groupBy({
      by: ["studentId"],
      where: enrollmentWhere,
    }),
    prisma.studentProgression.findMany({
      where: { locationId },
      select: { studentId: true, status: true, attendanceRate: true, expectedWeeks: true },
    }),
  ]);

  let rentalCollectedCad = 0;
  let rentalPendingCad = 0;
  for (const r of rentals) {
    const cad = r.priceCents / 100;
    if (r.paymentStatus === "PAID" || r.paymentStatus === "WAIVED_STAFF") {
      const when = r.confirmedAt ?? r.createdAt;
      if (when >= weekStart) rentalCollectedCad += cad;
    } else if (
      r.paymentStatus === "PENDING_INTERAC" ||
      r.paymentStatus === "PENDING_PAYPAL" ||
      r.paymentStatus === "PENDING_APPROVAL"
    ) {
      rentalPendingCad += cad;
    }
  }

  const unpaidIds = new Set(unpaidSeated.map((e) => e.studentId));

  return {
    collectedCad: paidWeek.reduce((sum, e) => sum + (asPlainNumber(e.amountCad) ?? 0), 0),
    pendingInteracCad: pendingInterac.reduce(
      (sum, e) => sum + (asPlainNumber(e.amountCad) ?? 0),
      0,
    ),
    unpaidSeatedCad: unpaidSeated.reduce((sum, e) => sum + (asPlainNumber(e.amountCad) ?? 0), 0),
    rentalCollectedCad,
    rentalPendingCad,
    studentCount: students.length,
    unpaidStudentCount: unpaidIds.size,
    readyCount: progressions.filter((p) => p.status === "READY_TO_ADVANCE").length,
    churnCount: progressions.filter(
      (p) =>
        p.status !== "COMPLETED" &&
        p.status !== "READY_TO_ADVANCE" &&
        p.expectedWeeks >= 3 &&
        p.attendanceRate < 0.4,
    ).length,
  };
}
