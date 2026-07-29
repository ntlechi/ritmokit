import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { asPlainNumber } from "@/lib/data/serialize";
import { evaluateParityEnrollment, isParityAlert } from "@/lib/dance/parity";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import {
  resolveEnrollmentAmountCad,
  type PricingTier,
} from "@/lib/dance/pricing";
import { createEnrollmentCheckout, type PaymentProvider } from "@/lib/public-api/payments";
import { loadSessionCapacity } from "@/lib/public-api/capacity";
import { prisma } from "@/lib/prisma";

export { resolveEnrollmentAmountCad } from "@/lib/dance/pricing";

export const publicEnrollSchema = z.object({
  sessionId: z.string().uuid(),
  danceRole: z.enum(["LEAD", "FOLLOW", "SOLO"]),
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().nullable(),
  locale: z.enum(["fr", "en", "es"]).optional().default("fr"),
  allowWaitlist: z.boolean().optional().default(true),
  pricingTier: z.enum(["REGULAR", "STUDENT", "COUPLE", "UNLIMITED_PASS"]).optional().default("REGULAR"),
  paymentProvider: z.enum(["paypal", "stripe", "none"]).optional(),
  returnUrl: z.string().url().optional().nullable(),
  cancelUrl: z.string().url().optional().nullable(),
  /** When true, mark paid immediately (offline / test). Default false. */
  markPaid: z.boolean().optional().default(false),
  paymentRef: z.string().max(120).optional().nullable(),
});

export type PublicEnrollInput = z.infer<typeof publicEnrollSchema>;

export type PublicEnrollResult =
  | {
      ok: true;
      enrollmentId: string;
      studentId: string;
      waitlisted: boolean;
      paid: boolean;
      payment: Awaited<ReturnType<typeof createEnrollmentCheckout>>;
    }
  | { ok: false; error: string; status: number };

function localeToPrisma(locale: string): "FR" | "EN" | "ES" {
  if (locale === "en") return "EN";
  if (locale === "es") return "ES";
  return "FR";
}

async function findOrCreateStudent(input: {
  email: string;
  fullName: string;
  phone?: string | null;
  locale: string;
}): Promise<{ id: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || undefined,
      },
    });
    return { id: existing.id, created: false };
  }

  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      email,
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      role: "STUDENT",
      locale: localeToPrisma(input.locale),
    },
  });
  return { id, created: true };
}

export async function createPublicEnrollment(
  input: PublicEnrollInput,
): Promise<PublicEnrollResult> {
  const session = await prisma.classSession.findUnique({
    where: { id: input.sessionId },
    include: {
      season: { select: { id: true, status: true, bookingOpen: true, locationId: true } },
      room: { select: { locationId: true } },
    },
  });

  if (!session) return { ok: false, error: "session_not_found", status: 404 };

  // Booking must be open on an ACTIVE season when linked; orphan classes allow booking.
  if (session.season) {
    if (session.season.status !== "ACTIVE" || !session.season.bookingOpen) {
      return { ok: false, error: "booking_closed", status: 409 };
    }
  }

  const capacity = await loadSessionCapacity(session.id);
  if (!capacity) return { ok: false, error: "session_not_found", status: 404 };

  const decision = evaluateParityEnrollment(capacity, input.danceRole, {
    allowWaitlist: input.allowWaitlist,
  });
  if (!decision.ok) {
    return { ok: false, error: `parity_${decision.reason}`, status: 409 };
  }

  const student = await findOrCreateStudent({
    email: input.email,
    fullName: input.fullName,
    phone: input.phone,
    locale: input.locale,
  });

  const existingEnrollment = await prisma.enrollment.findUnique({
    where: {
      sessionId_studentId: { sessionId: session.id, studentId: student.id },
    },
    select: { id: true },
  });
  if (existingEnrollment) {
    return { ok: false, error: "already_enrolled", status: 409 };
  }

  const paid = Boolean(input.markPaid);
  const pricingTier: PricingTier =
    input.pricingTier === "STUDENT" ||
    input.pricingTier === "COUPLE" ||
    input.pricingTier === "UNLIMITED_PASS"
      ? input.pricingTier
      : "REGULAR";
  const amountCad = resolveEnrollmentAmountCad(
    {
      priceRegular: asPlainNumber(session.priceRegular),
      priceCouple: session.priceCouple != null ? asPlainNumber(session.priceCouple) : null,
      priceStudent: session.priceStudent != null ? asPlainNumber(session.priceStudent) : null,
    },
    pricingTier,
  );
  const enrollment = await prisma.enrollment.create({
    data: {
      sessionId: session.id,
      studentId: student.id,
      danceRole: input.danceRole,
      waitlisted: decision.waitlisted,
      waitlistedAt: decision.waitlisted ? new Date() : null,
      paid,
      paymentStatus: paid ? "PAID" : "NONE",
      paidAt: paid ? new Date() : null,
      pricingTier,
      amountCad,
      paymentRef: input.paymentRef ?? null,
    },
  });

  // Waitlisted seats hold a place in queue — checkout only after promotion.
  let payment: Awaited<ReturnType<typeof createEnrollmentCheckout>> = {
    status: "deferred",
    provider: (input.paymentProvider as PaymentProvider | undefined) ?? "none",
    checkoutUrl: null,
    paymentRef: null,
    message: decision.waitlisted
      ? "Waitlisted — payment opens when a seat is promoted."
      : "No checkout required.",
  };

  if (!decision.waitlisted && !paid) {
    try {
      payment = await createEnrollmentCheckout({
        provider: (input.paymentProvider as PaymentProvider | undefined) ?? undefined,
        amountCad,
        enrollmentId: enrollment.id,
        sessionId: session.id,
        studentEmail: input.email.trim().toLowerCase(),
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
      });

      if (payment.paymentRef) {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: {
            paymentRef: payment.paymentRef,
            paymentStatus: payment.status === "pending" ? "PENDING" : "NONE",
          },
        });
      }
    } catch (error) {
      console.error("[public:enrollments] checkout failed", error);
      payment = {
        status: "deferred",
        provider: (input.paymentProvider as PaymentProvider | undefined) ?? "paypal",
        checkoutUrl: null,
        paymentRef: null,
        message: "Enrollment saved unpaid — checkout provider failed. Retry via /checkout.",
      };
    }
  }

  const nextCap = {
    ...capacity,
    filledLeads:
      capacity.filledLeads + (input.danceRole === "LEAD" && !decision.waitlisted ? 1 : 0),
    filledFollows:
      capacity.filledFollows + (input.danceRole === "FOLLOW" && !decision.waitlisted ? 1 : 0),
  };

  await enqueueAndRunDanceAgent({
    eventType: "enrollment.created",
    payload: {
      sessionId: session.id,
      enrollmentId: enrollment.id,
      studentId: student.id,
      danceRole: input.danceRole,
      waitlisted: decision.waitlisted,
      paid,
      source: "public_api",
      locationId: session.season?.locationId ?? session.room.locationId,
    },
  });

  if (isParityAlert(nextCap) || decision.waitlisted) {
    await enqueueAndRunDanceAgent({
      eventType: "enrollment.parity_alert",
      payload: {
        sessionId: session.id,
        enrollmentId: enrollment.id,
        studentId: student.id,
        danceRole: input.danceRole,
        waitlisted: decision.waitlisted,
        capacity: nextCap,
        source: "public_api",
      },
    });
  }

  // A newly seated Lead/Follow may unlock the opposite waitlist immediately.
  if (!decision.waitlisted) {
    await tryPromoteWaitlist(session.id).catch((error) => {
      console.error("[public:enrollments] waitlist promote failed", error);
    });
  }

  return {
    ok: true,
    enrollmentId: enrollment.id,
    studentId: student.id,
    waitlisted: decision.waitlisted,
    paid,
    payment,
  };
}
