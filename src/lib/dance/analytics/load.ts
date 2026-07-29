import "server-only";

import { asPlainNumber } from "@/lib/data/serialize";
import { aggregateDanceAnalytics, type RawClassForAnalytics } from "@/lib/dance/analytics/aggregates";
import type { DanceAnalyticsBundle } from "@/lib/dance/analytics/types";
import type { PricingTier } from "@/lib/dance/pricing";
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

  return aggregateDanceAnalytics(locationId, raw);
}
