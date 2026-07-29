/**
 * Auto-promote waitlisted opposite-role dancers when capacity opens (Phase A).
 * Uses FOR UPDATE SKIP LOCKED so concurrent Lead enrollments cannot promote
 * the same Follow twice.
 */
import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { evaluateParityEnrollment, type RoleCapacity } from "@/lib/dance/parity";
import { sendEnrollmentEmail } from "@/lib/notifications/email";
import { createEnrollmentCheckout } from "@/lib/public-api/payments";
import { asPlainNumber } from "@/lib/data/serialize";
import { prisma } from "@/lib/prisma";

export type PromoteResult = {
  enrollmentId: string;
  studentId: string;
  danceRole: "LEAD" | "FOLLOW";
  checkoutUrl: string | null;
};

const MAX_PROMOTIONS_PER_TRIGGER = 3;

async function loadActiveCapacity(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<(RoleCapacity & { maxLeads: number; maxFollows: number }) | null> {
  const session = await tx.classSession.findUnique({
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

type CandidateRow = { id: string };

async function lockNextWaitlisted(
  tx: Prisma.TransactionClient,
  sessionId: string,
  role: "LEAD" | "FOLLOW",
): Promise<string | null> {
  const rows = await tx.$queryRaw<CandidateRow[]>`
    SELECT id
    FROM enrollments
    WHERE session_id = ${sessionId}::uuid
      AND waitlisted = true
      AND dance_role = ${role}::"DanceRole"
    ORDER BY waitlisted_at ASC NULLS LAST, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
  return rows[0]?.id ?? null;
}

/**
 * Promote up to MAX_PROMOTIONS_PER_TRIGGER waitlisted seats for `sessionId`.
 * Prefer promoting whichever opposite role is currently scarcer / waitlisted.
 */
export async function tryPromoteWaitlist(sessionId: string): Promise<PromoteResult[]> {
  const results: PromoteResult[] = [];

  for (let i = 0; i < MAX_PROMOTIONS_PER_TRIGGER; i += 1) {
    const promoted = await promoteOne(sessionId);
    if (!promoted) break;
    results.push(promoted);
  }

  return results;
}

async function promoteOne(sessionId: string): Promise<PromoteResult | null> {
  const locked = await prisma.$transaction(async (tx) => {
    const capacity = await loadActiveCapacity(tx, sessionId);
    if (!capacity) return null;

    // Prefer promoting the role that has people waiting and that parity allows.
    const waitCounts = await tx.enrollment.groupBy({
      by: ["danceRole"],
      where: { sessionId, waitlisted: true, danceRole: { in: ["LEAD", "FOLLOW"] } },
      _count: true,
    });
    const waitingLeads = waitCounts.find((w) => w.danceRole === "LEAD")?._count ?? 0;
    const waitingFollows = waitCounts.find((w) => w.danceRole === "FOLLOW")?._count ?? 0;
    if (waitingLeads === 0 && waitingFollows === 0) return null;

    const tryOrder: Array<"LEAD" | "FOLLOW"> =
      waitingFollows >= waitingLeads ? ["FOLLOW", "LEAD"] : ["LEAD", "FOLLOW"];

    for (const role of tryOrder) {
      const waiting = role === "LEAD" ? waitingLeads : waitingFollows;
      if (waiting <= 0) continue;

      const decision = evaluateParityEnrollment(capacity, role, { allowWaitlist: false });
      if (!decision.ok || decision.waitlisted) continue;

      const candidateId = await lockNextWaitlisted(tx, sessionId, role);
      if (!candidateId) continue;

      // Re-check after lock (capacity may have changed within the same TX via prior loops).
      const freshCap = await loadActiveCapacity(tx, sessionId);
      if (!freshCap) return null;
      const again = evaluateParityEnrollment(freshCap, role, { allowWaitlist: false });
      if (!again.ok || again.waitlisted) continue;

      await tx.enrollment.update({
        where: { id: candidateId },
        data: {
          waitlisted: false,
          waitlistedAt: null,
          promotedAt: new Date(),
        },
      });

      const row = await tx.enrollment.findUnique({
        where: { id: candidateId },
        select: {
          id: true,
          studentId: true,
          danceRole: true,
          paid: true,
          amountCad: true,
          pricingTier: true,
          student: { select: { email: true, fullName: true, locale: true } },
          session: {
            select: {
              id: true,
              course: { select: { title: true } },
            },
          },
        },
      });
      if (!row || row.danceRole === "SOLO") return null;

      return {
        enrollmentId: row.id,
        studentId: row.studentId,
        danceRole: row.danceRole as "LEAD" | "FOLLOW",
        paid: row.paid,
        amountCad: row.amountCad != null ? asPlainNumber(row.amountCad) : 0,
        pricingTier: row.pricingTier,
        email: row.student.email,
        fullName: row.student.fullName,
        locale: row.student.locale,
        courseTitle: row.session.course.title,
        sessionId: row.session.id,
      };
    }

    return null;
  });

  if (!locked) return null;

  let checkoutUrl: string | null = null;

  if (!locked.paid) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    const payment = await createEnrollmentCheckout({
      provider: "paypal",
      amountCad: locked.amountCad,
      enrollmentId: locked.enrollmentId,
      sessionId: locked.sessionId,
      studentEmail: locked.email,
      description: locked.courseTitle,
      returnUrl: `${appUrl}/fr/login?paid=1&enrollmentId=${locked.enrollmentId}`,
      cancelUrl: `${appUrl}/fr/login?cancelled=1&enrollmentId=${locked.enrollmentId}`,
    });

    if (payment.paymentRef) {
      await prisma.enrollment.update({
        where: { id: locked.enrollmentId },
        data: {
          paymentRef: payment.paymentRef,
          paymentStatus: payment.status === "pending" ? "PENDING" : "NONE",
        },
      });
    }
    checkoutUrl = payment.checkoutUrl;

    if (payment.paymentRef && payment.status === "pending") {
      await prisma.paymentEvent
        .create({
          data: {
            enrollmentId: locked.enrollmentId,
            provider: "PAYPAL",
            externalTransactionId: payment.paymentRef,
            eventType: "checkout.created",
            payload: {
              source: "waitlist_promote",
              checkoutUrl: payment.checkoutUrl,
            },
          },
        })
        .catch(() => {
          /* unique race ok */
        });
    }

    const locale = locked.locale === "EN" ? "en" : locked.locale === "ES" ? "es" : "fr";
    const subject =
      locale === "en"
        ? `A spot opened — ${locked.courseTitle}`
        : locale === "es"
          ? `Se liberó un cupo — ${locked.courseTitle}`
          : `Une place s'est libérée — ${locked.courseTitle}`;
    const payLine = checkoutUrl
      ? locale === "en"
        ? `\n\nPay here to confirm your seat:\n${checkoutUrl}`
        : locale === "es"
          ? `\n\nPaga aquí para confirmar tu lugar:\n${checkoutUrl}`
          : `\n\nPayez ici pour confirmer votre place :\n${checkoutUrl}`
      : "";
    const text =
      locale === "en"
        ? `Hi ${locked.fullName},\n\nYou were next on the waitlist for ${locked.courseTitle}. Your seat is unlocked.${payLine}\n\n— RitmoKit`
        : locale === "es"
          ? `Hola ${locked.fullName},\n\nEras el siguiente en la lista de espera de ${locked.courseTitle}. Tu lugar está desbloqueado.${payLine}\n\n— RitmoKit`
          : `Bonjour ${locked.fullName},\n\nVous étiez le prochain sur la liste d'attente pour ${locked.courseTitle}. Votre place est débloquée.${payLine}\n\n— RitmoKit`;

    await sendEnrollmentEmail({
      to: locked.email,
      kind: "waitlist_promoted_pay",
      subject,
      text,
      meta: { enrollmentId: locked.enrollmentId, checkoutUrl },
    });
  } else {
    const locale = locked.locale === "EN" ? "en" : locked.locale === "ES" ? "es" : "fr";
    await sendEnrollmentEmail({
      to: locked.email,
      kind: "waitlist_promoted_confirmed",
      subject:
        locale === "en"
          ? `You're in — ${locked.courseTitle}`
          : locale === "es"
            ? `Estás inscrito — ${locked.courseTitle}`
            : `Vous êtes inscrit·e — ${locked.courseTitle}`,
      text:
        locale === "en"
          ? `Hi ${locked.fullName},\n\nA seat opened in ${locked.courseTitle}. You're confirmed.\n\n— RitmoKit`
          : locale === "es"
            ? `Hola ${locked.fullName},\n\nSe liberó un cupo en ${locked.courseTitle}. Estás confirmado.\n\n— RitmoKit`
            : `Bonjour ${locked.fullName},\n\nUne place s'est libérée dans ${locked.courseTitle}. Vous êtes confirmé·e.\n\n— RitmoKit`,
      meta: { enrollmentId: locked.enrollmentId },
    });
  }

  await enqueueAndRunDanceAgent({
    eventType: "enrollment.waitlist_promoted",
    payload: {
      enrollmentId: locked.enrollmentId,
      sessionId: locked.sessionId,
      studentId: locked.studentId,
      danceRole: locked.danceRole,
      paid: locked.paid,
      checkoutUrl,
    },
  });

  return {
    enrollmentId: locked.enrollmentId,
    studentId: locked.studentId,
    danceRole: locked.danceRole,
    checkoutUrl,
  };
}
