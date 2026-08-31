import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { asPlainNumber } from "@/lib/data/serialize";
import {
  evaluateCoupleEnrollment,
  evaluateParityEnrollment,
  getPackagePeers,
  isParityAlert,
} from "@/lib/dance/parity";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import {
  resolveEnrollmentAmountCad,
  type PricingTier,
} from "@/lib/dance/pricing";
import { createEnrollmentCheckout, type PaymentProvider } from "@/lib/public-api/payments";
import { loadSessionCapacity } from "@/lib/public-api/capacity";
import {
  notifyStaffPendingInterac,
  publicPaymentStatus,
  ticketCodeForEnrollment,
} from "@/lib/payments/interac";
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
  paymentProvider: z.enum(["paypal", "stripe", "interac", "cash", "none"]).optional(),
  returnUrl: z.string().url().optional().nullable(),
  cancelUrl: z.string().url().optional().nullable(),
  /** When true, mark paid immediately (offline / test). Default false. */
  markPaid: z.boolean().optional().default(false),
  paymentRef: z.string().max(120).optional().nullable(),
  /**
   * Multi-day same-course package: sibling ClassSession ids.
   * Primary (`sessionId`) gets checkout; siblings are unpaid holds linked via paymentRef.
   */
  packageSessionIds: z.array(z.string().uuid()).max(14).optional(),
  partnerFullName: z.string().min(1).max(120).optional(),
  partnerEmail: z.string().email().max(200).optional(),
  partnerPhone: z.string().max(40).optional().nullable(),
});

export type PublicEnrollInput = z.infer<typeof publicEnrollSchema>;

export type PublicEnrollResult =
  | {
      ok: true;
      enrollmentId: string;
      studentId: string;
      waitlisted: boolean;
      paid: boolean;
      ticketCode: string;
      paymentStatus: string;
      payment: Awaited<ReturnType<typeof createEnrollmentCheckout>>;
      packageEnrollmentIds?: string[];
      partnerEnrollmentId?: string;
      checkoutError?: string;
      retryCheckout?: boolean;
      interacInstructions?: NonNullable<
        Awaited<ReturnType<typeof createEnrollmentCheckout>>["interacInstructions"]
      >;
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
      course: { select: { title: true } },
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

  const wantsCouple =
    input.pricingTier === "COUPLE" ||
    Boolean(input.partnerFullName?.trim() && input.partnerEmail?.trim());
  if (wantsCouple && input.danceRole === "SOLO") {
    return { ok: false, error: "invalid_couple_role", status: 400 };
  }
  if (wantsCouple && (!input.partnerFullName?.trim() || !input.partnerEmail?.trim())) {
    return { ok: false, error: "partner_required", status: 400 };
  }
  if (
    wantsCouple &&
    input.partnerEmail &&
    input.partnerEmail.trim().toLowerCase() === input.email.trim().toLowerCase()
  ) {
    return { ok: false, error: "partner_same_email", status: 400 };
  }

  const coupleDecision = wantsCouple ? evaluateCoupleEnrollment(capacity) : null;
  if (wantsCouple && (!coupleDecision?.ok || coupleDecision.waitlisted)) {
    return { ok: false, error: "parity_couple_full", status: 409 };
  }

  const decision = wantsCouple
    ? { ok: true as const, waitlisted: false }
    : evaluateParityEnrollment(capacity, input.danceRole, {
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
  const pricingTier: PricingTier = wantsCouple
    ? "COUPLE"
    : input.pricingTier === "STUDENT" || input.pricingTier === "UNLIMITED_PASS"
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

  const locationId = session.season?.locationId ?? session.room.locationId;
  const courseTitle = session.course.title;

  // Pre-generate id so ticket code is stable at insert time.
  const enrollmentId = randomUUID();
  const ticketCode = ticketCodeForEnrollment(enrollmentId);
  const interacHint = `${input.fullName.trim()}, ${courseTitle}`;

  const enrollment = await prisma.enrollment.create({
    data: {
      id: enrollmentId,
      sessionId: session.id,
      studentId: student.id,
      danceRole: input.danceRole,
      waitlisted: decision.waitlisted,
      waitlistedAt: decision.waitlisted ? new Date() : null,
      paid,
      paymentStatus: paid ? "PAID" : "NONE",
      paymentProvider: paid ? "CASH" : null,
      paidAt: paid ? new Date() : null,
      pricingTier,
      amountCad,
      currency: "CAD",
      paymentRef: input.paymentRef ?? null,
      ticketCode,
      interacReferenceHint: interacHint,
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
        studentName: input.fullName.trim(),
        courseName: courseTitle,
        locationId,
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
      });

      if (payment.status === "pending_interac") {
        const now = new Date();
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: {
            paymentRef: payment.paymentRef,
            paymentStatus: "PENDING_INTERAC",
            paymentProvider: "INTERAC",
            paymentPendingAt: now,
            interacReferenceHint:
              payment.interacInstructions?.referenceHint ?? interacHint,
          },
        });

        void notifyStaffPendingInterac({
          locationId,
          enrollmentId: enrollment.id,
          studentName: input.fullName.trim(),
          courseName: courseTitle,
          amountCad,
        });
      } else if (payment.paymentRef || payment.status === "pending") {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: {
            paymentRef: payment.paymentRef,
            paymentStatus: payment.status === "pending" ? "PENDING" : "NONE",
            paymentProvider:
              payment.provider === "paypal"
                ? "PAYPAL"
                : payment.provider === "stripe"
                  ? "STRIPE"
                  : payment.provider === "cash"
                    ? "CASH"
                    : null,
            ...(payment.status === "pending" ? { paymentPendingAt: new Date() } : {}),
          },
        });
      }
    } catch (error) {
      console.error("[public:enrollments] checkout failed", error);
      payment = {
        status: "error",
        provider: (input.paymentProvider as PaymentProvider | undefined) ?? "paypal",
        checkoutUrl: null,
        paymentRef: null,
        error: "checkout_failed",
        retryCheckout: true,
        message: "Enrollment saved unpaid — checkout provider failed. Retry via /checkout.",
      };
    }
  }

  // Package siblings: same course title across weekdays = one payment (Salsa parity).
  // Auto-resolve peers in the season; if client sends packageSessionIds, intersect for safety.
  const packageEnrollmentIds: string[] = [enrollment.id];
  let siblingIds: string[] = [];
  if (!decision.waitlisted && session.seasonId) {
    const seasonClasses = await prisma.classSession.findMany({
      where: { seasonId: session.seasonId },
      select: { id: true, course: { select: { title: true } } },
    });
    const peerIds = getPackagePeers(
      seasonClasses.map((c) => ({ id: c.id, courseTitle: c.course.title })),
      { id: session.id, courseTitle: courseTitle },
    )
      .map((p) => p.id)
      .filter((id) => id !== session.id);
    const requested = (input.packageSessionIds ?? []).filter((id) => id !== session.id);
    siblingIds =
      requested.length > 0
        ? requested.filter((id) => peerIds.includes(id))
        : peerIds;
  }
  const partnerRole =
    wantsCouple && input.danceRole === "LEAD"
      ? ("FOLLOW" as const)
      : wantsCouple && input.danceRole === "FOLLOW"
        ? ("LEAD" as const)
        : null;
  let partnerEnrollmentId: string | undefined;
  if (partnerRole && input.partnerFullName && input.partnerEmail && !decision.waitlisted) {
    const partner = await findOrCreateStudent({
      email: input.partnerEmail,
      fullName: input.partnerFullName,
      phone: input.partnerPhone,
      locale: input.locale,
    });
    const existingPartner = await prisma.enrollment.findUnique({
      where: {
        sessionId_studentId: { sessionId: session.id, studentId: partner.id },
      },
      select: { id: true },
    });
    if (existingPartner) {
      partnerEnrollmentId = existingPartner.id;
    } else {
      const partnerId = randomUUID();
      await prisma.enrollment.create({
        data: {
          id: partnerId,
          sessionId: session.id,
          studentId: partner.id,
          danceRole: partnerRole,
          waitlisted: false,
          paid,
          paymentStatus: paid ? "PAID" : "NONE",
          paymentProvider: paid ? "CASH" : null,
          paidAt: paid ? new Date() : null,
          pricingTier: "COUPLE",
          amountCad: 0,
          currency: "CAD",
          paymentRef: `couple:${enrollment.id}`,
          ticketCode: ticketCodeForEnrollment(partnerId),
          interacReferenceHint: `${input.partnerFullName.trim()}, ${courseTitle}`,
        },
      });
      partnerEnrollmentId = partnerId;
    }
  }

  if (siblingIds.length && !decision.waitlisted) {
    for (const siblingSessionId of siblingIds) {
      const siblingCap = await loadSessionCapacity(siblingSessionId);
      if (!siblingCap) continue;
      const siblingDecision = evaluateParityEnrollment(siblingCap, input.danceRole, {
        allowWaitlist: false,
      });
      if (!siblingDecision.ok || siblingDecision.waitlisted) continue;

      const existingSibling = await prisma.enrollment.findUnique({
        where: {
          sessionId_studentId: { sessionId: siblingSessionId, studentId: student.id },
        },
        select: { id: true },
      });
      if (existingSibling) {
        packageEnrollmentIds.push(existingSibling.id);
        continue;
      }

      const siblingEnrollmentId = randomUUID();
      await prisma.enrollment.create({
        data: {
          id: siblingEnrollmentId,
          sessionId: siblingSessionId,
          studentId: student.id,
          danceRole: input.danceRole,
          waitlisted: false,
          paid: false,
          paymentStatus: "NONE",
          paymentProvider: null,
          pricingTier,
          amountCad: 0,
          currency: "CAD",
          paymentRef: `pkg:${enrollment.id}`,
          ticketCode: ticketCodeForEnrollment(siblingEnrollmentId),
          interacReferenceHint: interacHint,
        },
      });
      packageEnrollmentIds.push(siblingEnrollmentId);
    }
  }

  const refreshed = await prisma.enrollment.findUnique({
    where: { id: enrollment.id },
    select: { paymentStatus: true, paymentProvider: true },
  });

  const seatedCouple = Boolean(partnerEnrollmentId && !decision.waitlisted);
  const nextCap = {
    ...capacity,
    filledLeads:
      capacity.filledLeads +
      (input.danceRole === "LEAD" && !decision.waitlisted ? 1 : 0) +
      (seatedCouple && partnerRole === "LEAD" ? 1 : 0),
    filledFollows:
      capacity.filledFollows +
      (input.danceRole === "FOLLOW" && !decision.waitlisted ? 1 : 0) +
      (seatedCouple && partnerRole === "FOLLOW" ? 1 : 0),
  };

  if (!decision.waitlisted) {
    const { refreshProgressionForEnrollment } = await import("@/lib/dance/progression");
    void refreshProgressionForEnrollment(enrollment.id).catch((error) => {
      console.error("[public:enrollments] progression", error);
    });
  }

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
    ticketCode,
    paymentStatus: publicPaymentStatus(
      refreshed?.paymentStatus ?? (paid ? "PAID" : "NONE"),
      refreshed?.paymentProvider,
    ),
    payment,
    packageEnrollmentIds:
      packageEnrollmentIds.length > 1 ? packageEnrollmentIds : undefined,
    ...(partnerEnrollmentId ? { partnerEnrollmentId } : {}),
    ...(payment.status === "error"
      ? {
          checkoutError: payment.error ?? "checkout_failed",
          retryCheckout: true,
        }
      : {}),
    ...(payment.interacInstructions
      ? { interacInstructions: payment.interacInstructions }
      : {}),
  };
}
