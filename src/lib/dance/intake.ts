/**
 * StudentIntake writers. Called after the seat transaction commits — intake
 * bookkeeping must never fail or slow down a booking, so every entry point
 * swallows and logs its own errors.
 */
import "server-only";

import type { IntakeSource } from "@/generated/prisma/enums";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import {
  initialIntakeStatus,
  OPEN_INTAKE_STATUSES,
  statusOnReEnrollment,
} from "@/lib/dance/intake-rules";
import { sessionScopeWhere } from "@/lib/dance/tenant-scope";
import { prisma } from "@/lib/prisma";

/**
 * Record that a student booked at a location. `sessionIds` are every class
 * seated by this booking (package siblings included) so they are not counted
 * as "prior" enrollments.
 */
export async function recordIntake(input: {
  studentId: string;
  locationId: string;
  sessionIds: readonly string[];
  source: IntakeSource;
}): Promise<void> {
  try {
    await ensureStudioOsSchema();
    const key = { studentId: input.studentId, locationId: input.locationId };

    const existing = await prisma.studentIntake.findUnique({
      where: { studentId_locationId: key },
      select: { status: true },
    });
    if (existing) {
      const next = statusOnReEnrollment(existing.status);
      if (next) {
        await prisma.studentIntake.updateMany({
          where: { ...key, status: existing.status },
          data: { status: next },
        });
      }
      return;
    }

    const prior = await prisma.enrollment.count({
      where: {
        studentId: input.studentId,
        sessionId: { notIn: [...input.sessionIds] },
        session: sessionScopeWhere([input.locationId]),
      },
    });

    await prisma.studentIntake.createMany({
      data: [
        {
          ...key,
          status: initialIntakeStatus(prior),
          source: input.source,
          firstSessionId: input.sessionIds[0] ?? null,
        },
      ],
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("[intake] record", error);
  }
}

/** First check-in moves NEW / CONTACTED to ATTENDED. Conditional, so replays are no-ops. */
export async function advanceIntakeOnAttendance(enrollmentId: string): Promise<void> {
  try {
    const row = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        studentId: true,
        session: {
          select: {
            season: { select: { locationId: true } },
            room: { select: { locationId: true } },
          },
        },
      },
    });
    if (!row) return;
    const locationId = row.session.season?.locationId ?? row.session.room.locationId;
    await prisma.studentIntake.updateMany({
      where: { studentId: row.studentId, locationId, status: { in: [...OPEN_INTAKE_STATUSES] } },
      data: { status: "ATTENDED", firstAttendedAt: new Date() },
    });
  } catch (error) {
    console.error("[intake] attendance", error);
  }
}
