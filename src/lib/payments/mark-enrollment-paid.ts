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

  async function healPaidIfNeeded(): Promise<number> {
    if (row.paid && row.paymentStatus === "PAID") return 0;
    // Event already recorded but enrollment never flipped — heal so webhooks
    // cannot leave a permanently unpaid seat after PayPal success.
    await prisma.enrollment.update({
      where: { id: row.id },
      data: {
        paid: true,
        paymentStatus: "PAID",
        paymentProvider: input.provider,
        paidAt: row.paidAt ?? new Date(),
        paymentRef: input.externalTransactionId,
        ...(input.confirmedById ? { paymentConfirmedById: input.confirmedById } : {}),
        ...(amountCad != null ? { amountCad } : {}),
      },
    });
    const promoted = await tryPromoteWaitlist(row.sessionId);
    return promoted.length;
  }

  // Fast path: already recorded this exact event.
  const existingEvent = await prisma.paymentEvent.findUnique({
    where: {
      provider_externalTransactionId_eventType: {
        provider: input.provider,
        externalTransactionId: input.externalTransactionId,
        eventType: input.eventType,
      },
    },
    select: { id: true },
  });
  if (existingEvent) {
    const promoted = await healPaidIfNeeded();
    return { ok: true, alreadyProcessed: true, promoted };
  }

  try {
    await prisma.paymentEvent.create({
      data: {
        enrollmentId: row.id,
        provider: input.provider,
        externalTransactionId: input.externalTransactionId,
        eventType: input.eventType,
        payload: input.payload as object,
      },
    });
  } catch (error) {
    // Unique race — another worker won; still heal unpaid if needed.
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      const promoted = await healPaidIfNeeded();
      return { ok: true, alreadyProcessed: true, promoted };
    }
    throw error;
  }

  const wasPaid = row.paid && row.paymentStatus === "PAID";

  await prisma.enrollment.update({
    where: { id: row.id },
    data: {
      paid: true,
      paymentStatus: "PAID",
      paymentProvider: input.provider,
      paidAt: row.paidAt ?? new Date(),
      paymentRef: input.externalTransactionId,
      ...(input.confirmedById ? { paymentConfirmedById: input.confirmedById } : {}),
      ...(amountCad != null ? { amountCad } : {}),
      // Paying a waitlisted seat does not auto-seat them — promotion owns that.
    },
  });

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

  // A paid seat can unlock the opposite waitlist.
  const promoted = await tryPromoteWaitlist(row.sessionId);

  return { ok: true, alreadyProcessed: false, promoted: promoted.length };
}
