"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueAgentTask } from "@/lib/agents/bus";
import { actionDatabaseError } from "@/lib/actions/result";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { calculateClassEconomics } from "@/lib/dance/class-economics";
import { asPlainNumber } from "@/lib/data/serialize";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  lang: z.string().min(2).max(5),
  locationId: z.string().uuid(),
  periodStart: z.string().min(8),
  periodEnd: z.string().min(8),
});

export type InstructorPayrollBatchResult =
  | {
      ok: true;
      logs: Array<{
        instructorId: string;
        instructorName: string;
        totalClasses: number;
        totalHours: number;
        grossPay: number;
        logId: string;
      }>;
    }
  | { ok: false; error: string };

/**
 * Batch-calculate instructor payroll for all classes in a location/date window.
 * Upserts DRAFT InstructorPayrollLog rows and emits agent:dance payroll event.
 */
export async function calculateInstructorPayrollBatchAction(
  input: z.infer<typeof schema>,
): Promise<InstructorPayrollBatchResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  const periodStart = new Date(parsed.data.periodStart);
  const periodEnd = new Date(parsed.data.periodEnd);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    const sessions = await prisma.classSession.findMany({
      where: {
        room: { locationId: parsed.data.locationId },
        startTime: { gte: periodStart, lte: periodEnd },
      },
      include: {
        instructor: {
          select: {
            id: true,
            fullName: true,
            instructorPayType: true,
            instructorPayRate: true,
          },
        },
        room: { select: { surfaceSqm: true } },
        enrollments: {
          where: { waitlisted: false },
          select: { paid: true, attended: true },
        },
      },
    });

    const byInstructor = new Map<
      string,
      {
        name: string;
        totalClasses: number;
        totalHours: number;
        grossPay: number;
      }
    >();

    for (const session of sessions) {
      const hours = Math.max(
        0,
        (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60),
      );
      const paidCount = session.enrollments.filter((e) => e.paid).length;
      const attendees = session.enrollments.filter((e) => e.attended).length || paidCount;
      const economics = calculateClassEconomics({
        paidEnrollmentCount: paidCount,
        pricePerStudent: asPlainNumber(session.priceRegular),
        payType: session.instructor.instructorPayType,
        payRate:
          session.instructor.instructorPayRate != null
            ? asPlainNumber(session.instructor.instructorPayRate)
            : null,
        hours,
        attendees,
        surfaceSqm: session.room.surfaceSqm,
      });

      const prev = byInstructor.get(session.instructorId) ?? {
        name: session.instructor.fullName,
        totalClasses: 0,
        totalHours: 0,
        grossPay: 0,
      };
      prev.totalClasses += 1;
      prev.totalHours += hours;
      prev.grossPay += economics.instructorCost;
      byInstructor.set(session.instructorId, prev);
    }

    const logs: Array<{
      instructorId: string;
      instructorName: string;
      totalClasses: number;
      totalHours: number;
      grossPay: number;
      logId: string;
    }> = [];

    for (const [instructorId, agg] of byInstructor) {
      const existing = await prisma.instructorPayrollLog.findFirst({
        where: {
          instructorId,
          periodStart,
          periodEnd,
          status: "DRAFT",
        },
      });

      const data = {
        totalClasses: agg.totalClasses,
        totalHours: Math.round(agg.totalHours * 100) / 100,
        grossPay: Math.round(agg.grossPay * 100) / 100,
      };

      const log = existing
        ? await prisma.instructorPayrollLog.update({
            where: { id: existing.id },
            data,
          })
        : await prisma.instructorPayrollLog.create({
            data: {
              instructorId,
              periodStart,
              periodEnd,
              status: "DRAFT",
              ...data,
            },
          });

      logs.push({
        instructorId,
        instructorName: agg.name,
        totalClasses: data.totalClasses,
        totalHours: data.totalHours,
        grossPay: data.grossPay,
        logId: log.id,
      });
    }

    await enqueueAgentTask({
      channel: "agent:dance",
      eventType: "instructor.payroll_calculated",
      payload: {
        locationId: parsed.data.locationId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        instructorCount: logs.length,
        calculatedById: user.id,
      },
    });

    revalidatePath(`/${parsed.data.lang}/sessions`, "page");
    revalidatePath(`/${parsed.data.lang}/dashboard`, "page");

    return { ok: true, logs };
  } catch (error) {
    return actionDatabaseError("calculateInstructorPayroll", error) as InstructorPayrollBatchResult;
  }
}
