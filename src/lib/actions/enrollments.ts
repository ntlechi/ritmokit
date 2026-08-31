"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { evaluateParityEnrollment, isParityAlert, type RoleCapacity } from "@/lib/dance/parity";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import { civilDateInTimeZone, recordClassAttendance } from "@/lib/dance/progression";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessAccueil, canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveEnrollmentAmountCad } from "@/lib/public-api/enrollments";

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
        where: {
          waitlisted: false,
          paymentStatus: { not: "CANCELLED_INTERAC" },
        },
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

    const sessionPrices = await prisma.classSession.findUnique({
      where: { id: sessionId },
      select: { priceRegular: true, priceCouple: true, priceStudent: true },
    });
    if (!sessionPrices) return { ok: false, error: "session_not_found" };

    const isPaid = paid ?? false;
    const enrollment = await prisma.enrollment.create({
      data: {
        sessionId,
        studentId,
        danceRole,
        waitlisted: decision.waitlisted,
        waitlistedAt: decision.waitlisted ? new Date() : null,
        paid: isPaid,
        paymentStatus: isPaid ? "PAID" : "NONE",
        paidAt: isPaid ? new Date() : null,
        pricingTier: "REGULAR",
        amountCad: resolveEnrollmentAmountCad(
          {
            priceRegular: Number(sessionPrices.priceRegular),
            priceCouple:
              sessionPrices.priceCouple != null ? Number(sessionPrices.priceCouple) : null,
            priceStudent:
              sessionPrices.priceStudent != null ? Number(sessionPrices.priceStudent) : null,
          },
          "REGULAR",
        ),
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
      await enqueueAndRunDanceAgent({
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

    // Seating someone may unlock the opposite waitlist.
    if (!decision.waitlisted) {
      await tryPromoteWaitlist(sessionId).catch((error) => {
        console.error("[enrollStudent] promote failed", error);
      });
    }

    revalidatePath(`/${lang}/sessions`, "page");
    revalidatePath(`/${lang}/accueil`, "page");
    revalidatePath(`/${lang}/planning`, "page");
    return { ok: true, enrollmentId: enrollment.id, waitlisted: decision.waitlisted };
  } catch (error) {
    return actionDatabaseError("enrollStudent", error) as EnrollResult;
  }
}

export async function markAttendanceAction(input: {
  enrollmentId: string;
  attended: boolean;
  lang: string;
}): Promise<SimpleActionResult & { alreadyAttended?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!canAccessAccueil(user.role)) return { ok: false, error: "forbidden" };

  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      select: {
        id: true,
        waitlisted: true,
        attended: true,
        session: {
          select: {
            season: { select: { location: { select: { timezone: true } } } },
            room: { select: { location: { select: { timezone: true } } } },
          },
        },
      },
    });
    if (!enrollment) return { ok: false, error: "not_found" };
    if (enrollment.waitlisted) return { ok: false, error: "waitlisted" };
    if (input.attended && enrollment.attended) {
      return { ok: true, alreadyAttended: true };
    }

    await prisma.enrollment.update({
      where: { id: input.enrollmentId },
      data: { attended: input.attended },
    });

    const timezone =
      enrollment.session.season?.location.timezone ||
      enrollment.session.room.location.timezone ||
      "America/Toronto";
    await recordClassAttendance({
      enrollmentId: enrollment.id,
      attended: input.attended,
      occurredOn: civilDateInTimeZone(new Date(), timezone),
    }).catch((error) => {
      console.error("[markAttendance] progression", error);
    });

    revalidatePath(`/${input.lang}/sessions`, "page");
    revalidatePath(`/${input.lang}/accueil`, "page");
    revalidatePath(`/${input.lang}/students`, "page");
    revalidatePath(`/${input.lang}/planning`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("markAttendance", error);
  }
}

/**
 * Accueil / manager: release a seated enrollment (cancel or no-show)
 * so waitlist promote can fill the seat.
 */
export async function releaseEnrollmentSeatAction(input: {
  enrollmentId: string;
  lang: string;
  reason?: "cancel" | "no_show";
}): Promise<SimpleActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!canAccessAccueil(user.role) && !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "forbidden" };
  }

  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      select: { id: true, sessionId: true, waitlisted: true },
    });
    if (!enrollment) return { ok: false, error: "not_found" };

    const sessionId = enrollment.sessionId;
    await prisma.enrollment.delete({ where: { id: enrollment.id } });

    await tryPromoteWaitlist(sessionId).catch((error) => {
      console.error("[releaseSeat] promote failed", error);
    });

    if (!enrollment.waitlisted) {
      await enqueueAndRunDanceAgent({
        eventType: "enrollment.parity_alert",
        payload: {
          sessionId,
          enrollmentId: enrollment.id,
          reason: input.reason ?? "cancel",
          released: true,
        },
      }).catch(() => undefined);
    }

    revalidatePath(`/${input.lang}/sessions`, "page");
    revalidatePath(`/${input.lang}/accueil`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("releaseEnrollmentSeat", error);
  }
}
