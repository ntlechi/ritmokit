import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PaymentStatus } from "@/generated/prisma/enums";
import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { getPackagePeers, isParityAlert, type RoleCapacity } from "@/lib/dance/parity";
import {
  allocateCouple,
  allocateSeat,
  loadLockedCapacity,
  lockSessions,
  SEAT_TX_OPTIONS,
  type LockedSession,
  type SeatOutcome,
} from "@/lib/dance/seat-allocator";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import { resolveEnrollmentAmountCad, type PricingTier } from "@/lib/dance/pricing";
import { createEnrollmentCheckout, type PaymentProvider } from "@/lib/public-api/payments";
import {
  notifyStaffPendingInterac,
  publicPaymentStatus,
} from "@/lib/payments/interac";
import { prisma } from "@/lib/prisma";

export { resolveEnrollmentAmountCad } from "@/lib/dance/pricing";

/**
 * Anonymous headless input. Anything that can flip money state (`markPaid`,
 * `paymentRef`) is deliberately absent — payment truth only enters through
 * provider webhooks, the Interac queue, or the front desk.
 */
export const publicEnrollSchema = z
  .object({
    sessionId: z.string().uuid(),
    danceRole: z.enum(["LEAD", "FOLLOW", "SOLO"]),
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional().nullable(),
    locale: z.enum(["fr", "en", "es"]).optional().default("fr"),
    allowWaitlist: z.boolean().optional().default(true),
    pricingTier: z
      .enum(["REGULAR", "STUDENT", "COUPLE", "UNLIMITED_PASS"])
      .optional()
      .default("REGULAR"),
    paymentProvider: z.enum(["paypal", "stripe", "interac", "cash", "none"]).optional(),
    returnUrl: z.string().url().max(2000).optional().nullable(),
    cancelUrl: z.string().url().max(2000).optional().nullable(),
    /**
     * Multi-day same-course package: sibling ClassSession ids.
     * Primary (`sessionId`) gets checkout; siblings are unpaid holds linked via paymentRef.
     */
    packageSessionIds: z.array(z.string().uuid()).max(14).optional(),
    partnerFullName: z.string().trim().min(1).max(120).optional(),
    partnerEmail: z.string().trim().email().max(200).optional(),
    partnerPhone: z.string().trim().max(40).optional().nullable(),
  })
  .strip();

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
      /** True when a retried request matched an enrollment created moments ago. */
      replayed?: boolean;
      packageEnrollmentIds?: string[];
      partnerEnrollmentId?: string;
      checkoutError?: string;
      retryCheckout?: boolean;
      interacInstructions?: NonNullable<
        Awaited<ReturnType<typeof createEnrollmentCheckout>>["interacInstructions"]
      >;
    }
  | { ok: false; error: string; status: number };

/**
 * A second POST for the same (class, email) inside this window is treated as
 * a network retry of the first (double-tap, LTE resend) and replays its
 * result. Past it, it is a genuine duplicate → 409 `already_enrolled`.
 */
export const ENROLL_REPLAY_WINDOW_MS = 10 * 60_000;

function localeToPrisma(locale: string): "FR" | "EN" | "ES" {
  if (locale === "en") return "EN";
  if (locale === "es") return "ES";
  return "FR";
}

/** Race-free by construction: one `INSERT … ON CONFLICT (email)` round trip. */
async function upsertStudent(input: {
  email: string;
  fullName: string;
  phone?: string | null;
  locale: string;
}): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || undefined;
  return prisma.user.upsert({
    where: { email },
    create: {
      id: randomUUID(),
      email,
      fullName: input.fullName.trim(),
      phone: phone ?? null,
      role: "STUDENT",
      locale: localeToPrisma(input.locale),
    },
    update: { fullName: input.fullName.trim(), ...(phone ? { phone } : {}) },
    select: { id: true },
  });
}

type TxOutcome =
  | { kind: "not_found" }
  | { kind: "booking_closed" }
  | { kind: "refused"; reason: string }
  | {
      kind: "existing";
      enrollmentId: string;
      ticketCode: string | null;
      waitlisted: boolean;
      paid: boolean;
      paymentStatus: PaymentStatus;
      createdAt: Date;
    }
  | {
      kind: "created";
      session: LockedSession;
      primary: Extract<SeatOutcome, { kind: "seated" | "waitlisted" }>;
      partnerEnrollmentId?: string;
      packageEnrollmentIds: string[];
      amountCad: number;
      pricingTier: PricingTier;
      capacityAfter: RoleCapacity;
    };

export async function createPublicEnrollment(input: PublicEnrollInput): Promise<PublicEnrollResult> {
  // ---- Pre-flight (no lock): fast 404/409 before touching the hot row. ----
  const session = await prisma.classSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      seasonId: true,
      season: { select: { status: true, bookingOpen: true } },
      course: { select: { title: true } },
    },
  });
  if (!session) return { ok: false, error: "session_not_found", status: 404 };
  if (session.season && (session.season.status !== "ACTIVE" || !session.season.bookingOpen)) {
    return { ok: false, error: "booking_closed", status: 409 };
  }

  const email = input.email.trim().toLowerCase();
  const partnerEmail = input.partnerEmail?.trim().toLowerCase() || null;
  const wantsCouple =
    input.pricingTier === "COUPLE" || Boolean(input.partnerFullName?.trim() && partnerEmail);
  if (wantsCouple && input.danceRole === "SOLO") {
    return { ok: false, error: "invalid_couple_role", status: 400 };
  }
  if (wantsCouple && (!input.partnerFullName?.trim() || !partnerEmail)) {
    return { ok: false, error: "partner_required", status: 400 };
  }
  if (wantsCouple && partnerEmail === email) {
    return { ok: false, error: "partner_same_email", status: 400 };
  }

  const pricingTier: PricingTier = wantsCouple
    ? "COUPLE"
    : input.pricingTier === "STUDENT" || input.pricingTier === "UNLIMITED_PASS"
      ? input.pricingTier
      : "REGULAR";

  // Package siblings: same course title across weekdays = one payment.
  let siblingIds: string[] = [];
  if (session.seasonId) {
    const seasonClasses = await prisma.classSession.findMany({
      where: { seasonId: session.seasonId },
      select: { id: true, course: { select: { title: true } } },
    });
    const peerIds = getPackagePeers(
      seasonClasses.map((c) => ({ id: c.id, courseTitle: c.course.title })),
      { id: session.id, courseTitle: session.course.title },
    )
      .map((p) => p.id)
      .filter((id) => id !== session.id);
    const requested = (input.packageSessionIds ?? []).filter((id) => id !== session.id);
    siblingIds = requested.length > 0 ? requested.filter((id) => peerIds.includes(id)) : peerIds;
  }

  // Students live outside the seat lock — the users table is not contended.
  const [student, partner] = await Promise.all([
    upsertStudent({ email, fullName: input.fullName, phone: input.phone, locale: input.locale }),
    wantsCouple && partnerEmail && input.partnerFullName
      ? upsertStudent({
          email: partnerEmail,
          fullName: input.partnerFullName,
          phone: input.partnerPhone,
          locale: input.locale,
        })
      : Promise.resolve(null),
  ]);

  const courseTitle = session.course.title;
  const interacHint = `${input.fullName.trim()}, ${courseTitle}`;

  // ---- Atomic seat allocation under the per-class row lock. ----
  const outcome = await prisma.$transaction<TxOutcome>(async (tx) => {
    const locked = await lockSessions(tx, [session.id, ...siblingIds]);
    const primary = locked.get(session.id);
    if (!primary) return { kind: "not_found" };
    // Re-check under lock: an owner may have closed booking a moment ago.
    if (
      primary.seasonId &&
      (primary.seasonStatus !== "ACTIVE" || primary.bookingOpen !== true)
    ) {
      return { kind: "booking_closed" };
    }

    const amountCad = resolveEnrollmentAmountCad(
      {
        priceRegular: primary.priceRegular,
        priceCouple: primary.priceCouple,
        priceStudent: primary.priceStudent,
      },
      pricingTier,
    );

    let primarySeat: SeatOutcome;
    let partnerEnrollmentId: string | undefined;

    if (wantsCouple && partner && input.partnerFullName) {
      const couple = await allocateCouple(
        tx,
        primary,
        {
          studentId: student.id,
          danceRole: input.danceRole,
          allowWaitlist: false,
          pricingTier: "COUPLE",
          amountCad,
          interacReferenceHint: interacHint,
        },
        {
          studentId: partner.id,
          allowWaitlist: false,
          pricingTier: "COUPLE",
          amountCad: 0,
          interacReferenceHint: `${input.partnerFullName.trim()}, ${courseTitle}`,
        },
      );
      if (couple.kind === "refused") {
        return {
          kind: "refused",
          reason: couple.reason === "role_full" ? "couple_full" : couple.reason,
        };
      }
      primarySeat = couple.primary;
      if (couple.kind === "seated") {
        partnerEnrollmentId = couple.partner.enrollmentId;
      }
    } else {
      primarySeat = await allocateSeat(tx, primary, {
        studentId: student.id,
        danceRole: input.danceRole,
        allowWaitlist: input.allowWaitlist,
        pricingTier,
        amountCad,
        interacReferenceHint: interacHint,
      });
    }

    if (primarySeat.kind === "refused") return { kind: "refused", reason: primarySeat.reason };
    if (primarySeat.kind === "existing") {
      const e = primarySeat.existing;
      return {
        kind: "existing",
        enrollmentId: e.id,
        ticketCode: e.ticketCode,
        waitlisted: e.waitlisted,
        paid: e.paid,
        paymentStatus: e.paymentStatus,
        createdAt: e.createdAt,
      };
    }

    // Siblings are unpaid holds tied to the primary charge; never waitlisted.
    const packageEnrollmentIds = [primarySeat.enrollmentId];
    if (primarySeat.kind === "seated") {
      for (const siblingId of siblingIds) {
        const sibling = locked.get(siblingId);
        if (!sibling) continue;
        const seat = await allocateSeat(tx, sibling, {
          studentId: student.id,
          danceRole: input.danceRole,
          allowWaitlist: false,
          pricingTier,
          amountCad: 0,
          paymentRef: `pkg:${primarySeat.enrollmentId}`,
          interacReferenceHint: interacHint,
        });
        if (seat.kind === "seated" || seat.kind === "existing") {
          packageEnrollmentIds.push(seat.enrollmentId);
        }
      }
    }

    return {
      kind: "created",
      session: primary,
      primary: primarySeat,
      partnerEnrollmentId,
      packageEnrollmentIds,
      amountCad,
      pricingTier,
      capacityAfter: await loadLockedCapacity(tx, primary),
    };
  }, SEAT_TX_OPTIONS);

  if (outcome.kind === "not_found") return { ok: false, error: "session_not_found", status: 404 };
  if (outcome.kind === "booking_closed") return { ok: false, error: "booking_closed", status: 409 };
  if (outcome.kind === "refused") {
    return { ok: false, error: `parity_${outcome.reason}`, status: 409 };
  }

  if (outcome.kind === "existing") {
    const recent = Date.now() - outcome.createdAt.getTime() <= ENROLL_REPLAY_WINDOW_MS;
    if (!recent || outcome.paid) {
      return { ok: false, error: "already_enrolled", status: 409 };
    }
    // Idempotent replay: same answer the first request would have produced.
    return {
      ok: true,
      replayed: true,
      enrollmentId: outcome.enrollmentId,
      studentId: student.id,
      waitlisted: outcome.waitlisted,
      paid: false,
      ticketCode: outcome.ticketCode ?? "",
      paymentStatus: publicPaymentStatus(outcome.paymentStatus, null),
      payment: {
        status: "deferred",
        provider: (input.paymentProvider as PaymentProvider | undefined) ?? "none",
        checkoutUrl: null,
        paymentRef: null,
        retryCheckout: !outcome.waitlisted,
        message: outcome.waitlisted
          ? "Waitlisted — payment opens when a seat is promoted."
          : "Already enrolled moments ago — resume checkout via /checkout.",
      },
    };
  }

  // ---- Side effects (outside the lock): checkout, notifications, agents. ----
  const { primary, session: locked, amountCad } = outcome;
  const waitlisted = primary.kind === "waitlisted";
  const locationId = locked.locationId;

  let payment: Awaited<ReturnType<typeof createEnrollmentCheckout>> = {
    status: "deferred",
    provider: (input.paymentProvider as PaymentProvider | undefined) ?? "none",
    checkoutUrl: null,
    paymentRef: null,
    message: waitlisted
      ? "Waitlisted — payment opens when a seat is promoted."
      : "No checkout required.",
  };

  if (!waitlisted) {
    try {
      payment = await createEnrollmentCheckout({
        provider: (input.paymentProvider as PaymentProvider | undefined) ?? undefined,
        amountCad,
        enrollmentId: primary.enrollmentId,
        sessionId: locked.id,
        studentEmail: email,
        studentName: input.fullName.trim(),
        courseName: courseTitle,
        locationId,
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
      });

      if (payment.status === "pending_interac") {
        const now = new Date();
        // Conditional: never downgrade a seat a webhook already marked PAID.
        await prisma.enrollment.updateMany({
          where: { id: primary.enrollmentId, paid: false },
          data: {
            paymentRef: payment.paymentRef,
            paymentStatus: "PENDING_INTERAC",
            paymentProvider: "INTERAC",
            paymentPendingAt: now,
            interacReferenceHint: payment.interacInstructions?.referenceHint ?? interacHint,
          },
        });
        void notifyStaffPendingInterac({
          locationId,
          enrollmentId: primary.enrollmentId,
          studentName: input.fullName.trim(),
          courseName: courseTitle,
          amountCad,
        });
      } else if (payment.paymentRef || payment.status === "pending") {
        await prisma.enrollment.updateMany({
          where: { id: primary.enrollmentId, paid: false },
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

  const refreshed = await prisma.enrollment.findUnique({
    where: { id: primary.enrollmentId },
    select: { paymentStatus: true, paymentProvider: true },
  });

  if (!waitlisted) {
    const { refreshProgressionForEnrollment } = await import("@/lib/dance/progression");
    void refreshProgressionForEnrollment(primary.enrollmentId).catch((error) => {
      console.error("[public:enrollments] progression", error);
    });
  }

  await enqueueAndRunDanceAgent({
    eventType: "enrollment.created",
    payload: {
      sessionId: locked.id,
      enrollmentId: primary.enrollmentId,
      studentId: student.id,
      danceRole: input.danceRole,
      waitlisted,
      paid: false,
      source: "public_api",
      locationId,
    },
  });

  if (isParityAlert(outcome.capacityAfter) || waitlisted) {
    await enqueueAndRunDanceAgent({
      eventType: "enrollment.parity_alert",
      payload: {
        sessionId: locked.id,
        enrollmentId: primary.enrollmentId,
        studentId: student.id,
        danceRole: input.danceRole,
        waitlisted,
        capacity: outcome.capacityAfter,
        source: "public_api",
      },
    });
  }

  // A newly seated Lead/Follow may unlock the opposite waitlist immediately.
  if (!waitlisted) {
    await tryPromoteWaitlist(locked.id).catch((error) => {
      console.error("[public:enrollments] waitlist promote failed", error);
    });
  }

  return {
    ok: true,
    enrollmentId: primary.enrollmentId,
    studentId: student.id,
    waitlisted,
    paid: false,
    ticketCode: primary.ticketCode,
    paymentStatus: publicPaymentStatus(refreshed?.paymentStatus ?? "NONE", refreshed?.paymentProvider),
    payment,
    packageEnrollmentIds:
      outcome.packageEnrollmentIds.length > 1 ? outcome.packageEnrollmentIds : undefined,
    ...(outcome.partnerEnrollmentId ? { partnerEnrollmentId: outcome.partnerEnrollmentId } : {}),
    ...(payment.status === "error"
      ? { checkoutError: payment.error ?? "checkout_failed", retryCheckout: true }
      : {}),
    ...(payment.interacInstructions ? { interacInstructions: payment.interacInstructions } : {}),
  };
}
