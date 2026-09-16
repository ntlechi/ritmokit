"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { isParityAlert, type RoleCapacity } from "@/lib/dance/parity";
import {
  allocateSeat,
  loadLockedCapacity,
  lockSession,
  SEAT_TX_OPTIONS,
  sessionInLocations,
} from "@/lib/dance/seat-allocator";
import { enrollmentScopeWhere, staffScope } from "@/lib/dance/tenant-scope";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import { civilDateInTimeZone, refreshProgressionForEnrollment } from "@/lib/dance/progression";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessAccueil, canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveEnrollmentAmountCad } from "@/lib/dance/pricing";

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

type EnrollTx =
  | { kind: "not_found" }
  | { kind: "refused"; reason: string }
  | { kind: "existing"; enrollmentId: string; waitlisted: boolean }
  | { kind: "created"; enrollmentId: string; waitlisted: boolean; capacityAfter: RoleCapacity };

/** Staff-side enrollment (Sessions page). Same lock as the public path. */
export async function enrollStudentAction(input: z.infer<typeof enrollSchema>): Promise<EnrollResult> {
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { sessionId, studentId, danceRole, lang, allowWaitlist, paid, paymentRef } = parsed.data;

  try {
    const scope = await staffScope(user);
    const isPaid = paid ?? false;
    const now = new Date();

    const outcome = await prisma.$transaction<EnrollTx>(async (tx) => {
      const session = await lockSession(tx, sessionId);
      if (!session || !sessionInLocations(session, scope.locationIds)) return { kind: "not_found" };

      const seat = await allocateSeat(tx, session, {
        studentId,
        danceRole,
        allowWaitlist: allowWaitlist ?? true,
        pricingTier: "REGULAR",
        amountCad: resolveEnrollmentAmountCad(
          {
            priceRegular: session.priceRegular,
            priceCouple: session.priceCouple,
            priceStudent: session.priceStudent,
          },
          "REGULAR",
        ),
        interacReferenceHint: session.courseTitle,
        paymentRef: paymentRef ?? null,
        payment: isPaid
          ? {
              paid: true,
              paymentStatus: "PAID",
              paymentProvider: "CASH",
              paidAt: now,
              paymentPendingAt: null,
            }
          : undefined,
      });
      if (seat.kind === "refused") return { kind: "refused", reason: seat.reason };
      if (seat.kind === "existing") {
        return { kind: "existing", enrollmentId: seat.enrollmentId, waitlisted: seat.existing.waitlisted };
      }
      return {
        kind: "created",
        enrollmentId: seat.enrollmentId,
        waitlisted: seat.kind === "waitlisted",
        capacityAfter: await loadLockedCapacity(tx, session),
      };
    }, SEAT_TX_OPTIONS);

    if (outcome.kind === "not_found") return { ok: false, error: "session_not_found" };
    if (outcome.kind === "refused") return { ok: false, error: `parity_${outcome.reason}` };
    if (outcome.kind === "existing") return { ok: false, error: "already_enrolled" };

    if (isParityAlert(outcome.capacityAfter) || outcome.waitlisted) {
      await enqueueAndRunDanceAgent({
        eventType: "enrollment.parity_alert",
        payload: {
          sessionId,
          enrollmentId: outcome.enrollmentId,
          studentId,
          danceRole,
          waitlisted: outcome.waitlisted,
          capacity: outcome.capacityAfter,
        },
      });
    }

    // Seating someone may unlock the opposite waitlist.
    if (!outcome.waitlisted) {
      await tryPromoteWaitlist(sessionId).catch((error) => {
        console.error("[enrollStudent] promote failed", error);
      });
    }

    revalidatePath(`/${lang}/sessions`, "page");
    revalidatePath(`/${lang}/accueil`, "page");
    revalidatePath(`/${lang}/planning`, "page");
    return { ok: true, enrollmentId: outcome.enrollmentId, waitlisted: outcome.waitlisted };
  } catch (error) {
    return actionDatabaseError("enrollStudent", error) as EnrollResult;
  }
}

/**
 * PRÉSENT toggle — the 18:58 hot path.
 *
 * Three indexed round trips, all by primary key, no class-level lock:
 *   1. scoped read (tenant check + timezone),
 *   2. conditional `UPDATE … WHERE attended <> $1` (idempotent: a double tap
 *      or LTE retry updates 0 rows and reports `alreadyAttended`),
 *   3. `class_attendance` upsert keyed on (enrollment_id, occurred_on) — the
 *      "Déjà pointé" guard lives in the unique index, not in JS.
 * Evolution stats are recomputed after the response is sent.
 */
export async function markAttendanceAction(input: {
  enrollmentId: string;
  attended: boolean;
  lang: string;
}): Promise<SimpleActionResult & { alreadyAttended?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!canAccessAccueil(user.role)) return { ok: false, error: "forbidden" };
  if (!/^[0-9a-f-]{36}$/i.test(input.enrollmentId)) return { ok: false, error: "not_found" };

  try {
    const scope = await staffScope(user);
    const enrollment = await prisma.enrollment.findFirst({
      where: { id: input.enrollmentId, ...enrollmentScopeWhere(scope.locationIds) },
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

    const timezone =
      enrollment.session.season?.location.timezone ||
      enrollment.session.room.location.timezone ||
      "America/Toronto";
    const occurredOn = civilDateInTimeZone(new Date(), timezone);

    const [flip] = await prisma.$transaction([
      prisma.enrollment.updateMany({
        where: { id: enrollment.id, waitlisted: false, attended: { not: input.attended } },
        data: { attended: input.attended },
      }),
      prisma.classAttendance.upsert({
        where: { enrollmentId_occurredOn: { enrollmentId: enrollment.id, occurredOn } },
        create: { enrollmentId: enrollment.id, occurredOn, attended: input.attended },
        update: { attended: input.attended },
      }),
    ]);

    after(async () => {
      await refreshProgressionForEnrollment(enrollment.id).catch((error) => {
        console.error("[markAttendance] progression", error);
      });
    });

    revalidatePath(`/${input.lang}/accueil`, "page");
    if (flip.count === 0) return { ok: true, alreadyAttended: input.attended };

    revalidatePath(`/${input.lang}/sessions`, "page");
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
    const scope = await staffScope(user);
    const enrollment = await prisma.enrollment.findFirst({
      where: { id: input.enrollmentId, ...enrollmentScopeWhere(scope.locationIds) },
      select: { id: true, sessionId: true, waitlisted: true, paid: true },
    });
    if (!enrollment) return { ok: false, error: "not_found" };
    // Money on file must be refunded/cancelled explicitly, never dropped with the row.
    if (enrollment.paid) return { ok: false, error: "already_paid" };

    // Conditional delete: a concurrent payment webhook wins over a release.
    const deleted = await prisma.enrollment.deleteMany({
      where: { id: enrollment.id, paid: false },
    });
    if (deleted.count === 0) return { ok: false, error: "already_paid" };

    await tryPromoteWaitlist(enrollment.sessionId).catch((error) => {
      console.error("[releaseSeat] promote failed", error);
    });

    if (!enrollment.waitlisted) {
      await enqueueAndRunDanceAgent({
        eventType: "enrollment.parity_alert",
        payload: {
          sessionId: enrollment.sessionId,
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
