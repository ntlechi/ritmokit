/**
 * Idempotent paid transition for public enrollments (Phase A1b).
 * Unique (provider, externalTransactionId, eventType) prevents double-processing.
 */
import "server-only";

import { enqueueAgentTask } from "@/lib/agents/bus";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import { sendEnrollmentEmail } from "@/lib/notifications/email";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";

export type MarkPaidInput = {
  enrollmentId: string;
  provider: "PAYPAL" | "STRIPE";
  externalTransactionId: string;
  eventType: string;
  payload: unknown;
  amountCad?: number | null;
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
    return { ok: true, alreadyProcessed: true, promoted: 0 };
  }

  try {
    await prisma.paymentEvent.create({
      data: {
        enrollmentId: enrollment.id,
        provider: input.provider,
        externalTransactionId: input.externalTransactionId,
        eventType: input.eventType,
        payload: input.payload as object,
      },
    });
  } catch (error) {
    // Unique race — another worker won.
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return { ok: true, alreadyProcessed: true, promoted: 0 };
    }
    throw error;
  }

  const amountCad =
    input.amountCad != null && Number.isFinite(input.amountCad)
      ? input.amountCad
      : enrollment.amountCad != null
        ? asPlainNumber(enrollment.amountCad)
        : null;

  const wasPaid = enrollment.paid && enrollment.paymentStatus === "PAID";

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      paid: true,
      paymentStatus: "PAID",
      paidAt: enrollment.paidAt ?? new Date(),
      paymentRef: input.externalTransactionId,
      ...(amountCad != null ? { amountCad } : {}),
      // Paying a waitlisted seat does not auto-seat them — promotion owns that.
    },
  });

  if (!wasPaid) {
    const locale = enrollment.student.locale === "EN" ? "en" : enrollment.student.locale === "ES" ? "es" : "fr";
    const title = enrollment.session.course.title;
    const subject =
      locale === "en"
        ? `Payment confirmed — ${title}`
        : locale === "es"
          ? `Pago confirmado — ${title}`
          : `Paiement confirmé — ${title}`;
    const text =
      locale === "en"
        ? `Hi ${enrollment.student.fullName},\n\nYour payment for ${title} is confirmed. See you in class!\n\n— RitmoKit`
        : locale === "es"
          ? `Hola ${enrollment.student.fullName},\n\nTu pago para ${title} está confirmado. ¡Nos vemos en clase!\n\n— RitmoKit`
          : `Bonjour ${enrollment.student.fullName},\n\nVotre paiement pour ${title} est confirmé. À bientôt en cours!\n\n— RitmoKit`;

    await sendEnrollmentEmail({
      to: enrollment.student.email,
      kind: "payment_confirmed",
      subject,
      text,
      meta: {
        enrollmentId: enrollment.id,
        amountCad,
        provider: input.provider,
      },
    });

    await enqueueAgentTask({
      channel: "agent:dance",
      eventType: "enrollment.paid",
      payload: {
        enrollmentId: enrollment.id,
        sessionId: enrollment.sessionId,
        studentId: enrollment.studentId,
        provider: input.provider,
        externalTransactionId: input.externalTransactionId,
        amountCad,
      },
    });
  }

  // A paid seat can unlock the opposite waitlist.
  const promoted = await tryPromoteWaitlist(enrollment.sessionId);

  return { ok: true, alreadyProcessed: false, promoted: promoted.length };
}
