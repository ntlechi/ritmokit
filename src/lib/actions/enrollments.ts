"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueAgentTask } from "@/lib/agents/bus";
import { evaluateParityEnrollment, isParityAlert, type RoleCapacity } from "@/lib/dance/parity";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const enrollSchema = z.object({
  sessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  danceRole: z.enum(["LEAD", "FOLLOW", "SOLO"]),
  lang: z.string().min(2).max(5),
  allowWaitlist: z.boolean().optional(),
  paid: z.boolean().optional(),
  paymentRef: z.string().max(120).optional(),
});

export type EnrollResult =
  | { ok: true; enrollmentId: string; waitlisted: boolean }
  | { ok: false; error: string };

async function loadCapacity(sessionId: string): Promise<RoleCapacity | null> {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: {
      maxLeads: true,
      maxFollows: true,
      enrollments: {
        where: { waitlisted: false },
        select: { danceRole: true },
      },
    },
  });
  if (!session) return null;

  let filledLeads = 0;
  let filledFollows = 0;
  for (const e of session.enrollments) {
    if (e.danceRole === "LEAD") filledLeads += 1;
    else if (e.danceRole === "FOLLOW") filledFollows += 1;
  }

  return {
    maxLeads: session.maxLeads,
    maxFollows: session.maxFollows,
    filledLeads,
    filledFollows,
  };
}

export async function enrollStudentAction(input: z.infer<typeof enrollSchema>): Promise<EnrollResult> {
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { sessionId, studentId, danceRole, lang, allowWaitlist, paid, paymentRef } = parsed.data;

  try {
    const capacity = await loadCapacity(sessionId);
    if (!capacity) return { ok: false, error: "session_not_found" };

    const decision = evaluateParityEnrollment(capacity, danceRole, {
      allowWaitlist: allowWaitlist ?? true,
    });

    if (!decision.ok) {
      return { ok: false, error: `parity_${decision.reason}` };
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        sessionId,
        studentId,
        danceRole,
        waitlisted: decision.waitlisted,
        paid: paid ?? false,
        paymentRef: paymentRef ?? null,
      },
    });

    const nextCap: RoleCapacity = {
      ...capacity,
      filledLeads: capacity.filledLeads + (danceRole === "LEAD" && !decision.waitlisted ? 1 : 0),
      filledFollows:
        capacity.filledFollows + (danceRole === "FOLLOW" && !decision.waitlisted ? 1 : 0),
    };

    if (isParityAlert(nextCap) || decision.waitlisted) {
      await enqueueAgentTask({
        channel: "agent:dance",
        eventType: "enrollment.parity_alert",
        payload: {
          sessionId,
          enrollmentId: enrollment.id,
          studentId,
          danceRole,
          waitlisted: decision.waitlisted,
          capacity: nextCap,
        },
      });
    }

    revalidatePath(`/${lang}/sessions`, "page");
    return { ok: true, enrollmentId: enrollment.id, waitlisted: decision.waitlisted };
  } catch (error) {
    return actionDatabaseError("enrollStudent", error) as EnrollResult;
  }
}

export async function markAttendanceAction(input: {
  enrollmentId: string;
  attended: boolean;
  lang: string;
}): Promise<SimpleActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };

  try {
    await prisma.enrollment.update({
      where: { id: input.enrollmentId },
      data: { attended: input.attended },
    });
    revalidatePath(`/${input.lang}/sessions`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("markAttendance", error);
  }
}
