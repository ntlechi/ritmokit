import "server-only";

import { asPlainNumber } from "@/lib/data/serialize";
import { aggregateDanceAnalytics, type RawClassForAnalytics } from "@/lib/dance/analytics/aggregates";
import type { DanceAnalyticsBundle } from "@/lib/dance/analytics/types";
import { isChurnRisk } from "@/lib/dance/progression";
import type { PricingTier } from "@/lib/dance/pricing";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import { prisma } from "@/lib/prisma";
import { stationLabel } from "@/lib/stations/display";

function asPricingTier(value: string | null | undefined): PricingTier {
  if (value === "STUDENT" || value === "COUPLE" || value === "UNLIMITED_PASS") return value;
  return "REGULAR";
}

export async function loadDanceAnalyticsForLocation(
  locationId: string,
): Promise<DanceAnalyticsBundle> {
  const rows = await prisma.classSession.findMany({
    where: {
      OR: [{ season: { locationId } }, { room: { locationId } }],
    },
    include: {
      course: true,
      room: true,
      instructor: {
        select: {
          id: true,
          fullName: true,
          instructorPayType: true,
          instructorPayRate: true,
        },
      },
      enrollments: {
        select: {
          danceRole: true,
          paid: true,
          paymentStatus: true,
          waitlisted: true,
          attended: true,
          amountCad: true,
          pricingTier: true,
          studentId: true,
          student: { select: { fullName: true, email: true } },
        },
      },
    },
  });

  const raw: RawClassForAnalytics[] = rows.map((row) => ({
    id: row.id,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    maxLeads: row.maxLeads,
    maxFollows: row.maxFollows,
    priceRegular: asPlainNumber(row.priceRegular),
    priceCouple: row.priceCouple != null ? asPlainNumber(row.priceCouple) : null,
    priceStudent: row.priceStudent != null ? asPlainNumber(row.priceStudent) : null,
    courseTitle: row.course.title,
    style: row.course.style,
    level: row.course.level,
    roomId: row.roomId,
    roomName: stationLabel(row.room, "fr"),
    surfaceSqm: row.room.surfaceSqm,
    roomCapacity: row.room.capacity,
    instructorId: row.instructorId,
    instructorName: row.instructor.fullName,
    payType: row.instructor.instructorPayType,
    payRate:
      row.instructor.instructorPayRate != null
        ? asPlainNumber(row.instructor.instructorPayRate)
        : null,
    enrollments: row.enrollments.map((e) => ({
      danceRole: e.danceRole,
      paid: e.paid,
      paymentStatus: e.paymentStatus,
      waitlisted: e.waitlisted,
      attended: e.attended,
      amountCad: e.amountCad != null ? asPlainNumber(e.amountCad) : null,
      pricingTier: asPricingTier(e.pricingTier),
      studentId: e.studentId,
      studentName: e.student.fullName,
      studentEmail: e.student.email,
    })),
  }));

  const bundle = aggregateDanceAnalytics(locationId, raw);
  return overlayFunnelFromProgressions(locationId, bundle);
}

async function overlayFunnelFromProgressions(
  locationId: string,
  bundle: DanceAnalyticsBundle,
): Promise<DanceAnalyticsBundle> {
  try {
    await ensureStudioOsSchema();
    const rows = await prisma.studentProgression.findMany({
      where: { locationId },
      select: {
        studentId: true,
        currentLevel: true,
        status: true,
        attendanceRate: true,
        expectedWeeks: true,
        attendedCount: true,
        danceStyle: true,
        student: { select: { fullName: true, email: true } },
      },
    });
    if (rows.length === 0) return bundle;

    const byLevel = {
      BEGINNER: rows.filter((r) => r.currentLevel === "BEGINNER"),
      INTERMEDIATE: rows.filter((r) => r.currentLevel === "INTERMEDIATE"),
      ADVANCED: rows.filter((r) => r.currentLevel === "ADVANCED"),
    };
    const completed = (status: (typeof rows)[number]["status"]) =>
      status === "READY_TO_ADVANCE" || status === "COMPLETED";
    const beginnerCompleters = byLevel.BEGINNER.filter((r) => completed(r.status)).length;
    const intermediateCompleters = byLevel.INTERMEDIATE.filter((r) => completed(r.status)).length;

    const churnRiskStudents = rows
      .filter((r) =>
        isChurnRisk({
          status: r.status,
          attendanceRate: r.attendanceRate,
          expectedWeeks: r.expectedWeeks,
        }),
      )
      .map((r) => ({
        studentId: r.studentId,
        fullName: r.student.fullName,
        email: r.student.email,
        unpaidAttendanceMisses: Math.max(0, r.expectedWeeks - r.attendedCount),
        courseTitles: [r.danceStyle],
      }))
      .sort((a, b) => b.unpaidAttendanceMisses - a.unpaidAttendanceMisses || a.fullName.localeCompare(b.fullName));

    return {
      ...bundle,
      progression: {
        beginnerCompleters,
        intermediateEnrolled: byLevel.INTERMEDIATE.length,
        advancedEnrolled: byLevel.ADVANCED.length,
        l1ToL2Rate:
          byLevel.BEGINNER.length > 0
            ? Math.round((beginnerCompleters / byLevel.BEGINNER.length) * 1000) / 10
            : null,
        l2ToL3Rate:
          byLevel.INTERMEDIATE.length > 0
            ? Math.round((intermediateCompleters / byLevel.INTERMEDIATE.length) * 1000) / 10
            : null,
      },
      churnRiskStudents,
      aggregates: {
        ...bundle.aggregates,
        churnRiskCount: churnRiskStudents.length,
      },
    };
  } catch (error) {
    console.error("[analytics] progression overlay", error);
    return bundle;
  }
}
