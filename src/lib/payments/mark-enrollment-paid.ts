/**
 * Idempotent paid transition for public enrollments (Phase A1b).
 * Unique (provider, externalTransactionId, eventType) prevents double-processing.
 */
import "server-only";

import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import { sendEnrollmentEmail } from "@/lib/notifications/email";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";

export type MarkPaidInput = {
  enrollmentId: string;
  provider: "PAYPAL" | "STRIPE" | "INTERAC" | "CASH";
  externalTransactionId: string;
  eventType: string;
  payload: unknown;
  amountCad?: number | null;
  confirmedById?: string | null;
  /** When false, skip student confirmation email (staff chose confirm without email). */
  skipStudentEmail?: boolean;
};

export type MarkPaidResult =
  | { ok: true; alreadyProcessed: boolean; promoted: number }
  | { ok: false; error: string };

export async function markEnrollmentPaid(input: MarkPaidInput): Promise<MarkPaidResult> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
    include: {
      student: { select: { email: true, fullName: true, locale: true } },
      session: {
        select: {
          id: true,
          startTime: true,
          course: { select: { title: true } },
          room: { select: { nameFr: true } },
        },
      },
    },
  });

  if (!enrollment) {
    return { ok: false, error: "enrollment_not_found" };
  }

  const row = enrollment;

  const amountCad =
    input.amountCad != null && Number.isFinite(input.amountCad)
      ? input.amountCad
      : row.amountCad != null
        ? asPlainNumber(row.amountCad)
        : null;

  const now = new Date();

  /**
   * One short transaction, three conditional statements, zero pre-reads:
   *  1. ledger event — `skipDuplicates` on the unique key means a replayed
   *     webhook or a second tablet tap inserts 0 rows;
   *  2. seat flip — `WHERE paid = false OR payment_status <> 'PAID'` so only
   *     the first writer flips; the loser sees count 0 and stays silent;
   *  3. package/couple siblings ride the same charge.
   * Whoever flipped owns the side effects (email, agent event). Nobody else.
   */
  const { newEvent, flipped } = await prisma.$transaction(async (tx) => {
    const ev = await tx.paymentEvent.createMany({
      data: [
        {
          enrollmentId: row.id,
          provider: input.provider,
          externalTransactionId: input.externalTransactionId,
          eventType: input.eventType,
          payload: input.payload as object,
        },
      ],
      skipDuplicates: true,
    });

    const flip = await tx.enrollment.updateMany({
      where: {
        id: row.id,
        OR: [{ paid: false }, { paymentStatus: { not: "PAID" } }],
      },
      data: {
        paid: true,
        paymentStatus: "PAID",
        paymentProvider: input.provider,
        paidAt: row.paidAt ?? now,
        paymentRef: input.externalTransactionId,
        paymentCancelledAt: null,
        paymentCancelledById: null,
        cancellationReason: null,
        ...(input.confirmedById ? { paymentConfirmedById: input.confirmedById } : {}),
        ...(amountCad != null ? { amountCad } : {}),
        // Paying a waitlisted seat does not auto-seat them — promotion owns that.
      },
    });

    await tx.enrollment.updateMany({
      where: {
        paymentRef: { in: [`pkg:${row.id}`, `couple:${row.id}`] },
        paid: false,
        paymentStatus: { not: "CANCELLED_INTERAC" },
      },
      data: {
        paid: true,
        paymentStatus: "PAID",
        paymentProvider: input.provider,
        paidAt: now,
      },
    });

    return { newEvent: ev.count === 1, flipped: flip.count === 1 };
  });

  const wasPaid = !flipped;

  if (!wasPaid) {
    if (!input.skipStudentEmail) {
      const locale = row.student.locale === "EN" ? "en" : row.student.locale === "ES" ? "es" : "fr";
      const title = row.session.course.title;
      const subject =
        locale === "en"
          ? `Payment confirmed — ${title}`
          : locale === "es"
            ? `Pago confirmado — ${title}`
            : `Paiement confirmé — ${title}`;
      const text =
        locale === "en"
          ? `Hi ${row.student.fullName},\n\nYour payment for ${title} is confirmed. Your ticket is active — see you in class!\n\n— RitmoKit`
          : locale === "es"
            ? `Hola ${row.student.fullName},\n\nTu pago para ${title} está confirmado. Tu billete está activo. ¡Nos vemos en clase!\n\n— RitmoKit`
            : `Bonjour ${row.student.fullName},\n\nVotre paiement pour ${title} est confirmé. Votre billet est actif. À bientôt en cours!\n\n— RitmoKit`;

      await sendEnrollmentEmail({
        to: row.student.email,
        kind: "payment_confirmed",
        subject,
        text,
        meta: {
          enrollmentId: row.id,
          amountCad,
          provider: input.provider,
        },
      });
    }

    await enqueueAndRunDanceAgent({
      eventType: "enrollment.paid",
      payload: {
        enrollmentId: row.id,
        sessionId: row.sessionId,
        studentId: row.studentId,
        provider: input.provider,
        externalTransactionId: input.externalTransactionId,
        amountCad,
      },
    });
  }

  // A paid seat can unlock the opposite waitlist (no-op when nothing changed).
  const promoted = flipped ? await tryPromoteWaitlist(row.sessionId) : [];

  return { ok: true, alreadyProcessed: !newEvent, promoted: promoted.length };
}
