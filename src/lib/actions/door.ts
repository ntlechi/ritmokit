"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessAccueil, getSessionUser } from "@/lib/auth/session";
import { evaluateParityEnrollment } from "@/lib/dance/parity";
import { civilDateInTimeZone, refreshProgressionForEnrollment } from "@/lib/dance/progression";
import {
  allocateCouple,
  allocateSeat,
  loadLockedCapacity,
  lockSession,
  SEAT_TX_OPTIONS,
  sessionInLocations,
  type ExistingSeat,
  type LockedSession,
  type SeatPayment,
  type Tx,
} from "@/lib/dance/seat-allocator";
import { staffScope } from "@/lib/dance/tenant-scope";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import { resolveEnrollmentAmountCad } from "@/lib/dance/pricing";
import { ticketCodeForEnrollment } from "@/lib/payments/interac-status";
import { prisma } from "@/lib/prisma";

const walkInSchema = z.object({
  sessionId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  danceRole: z.enum(["LEAD", "FOLLOW", "SOLO"]),
  payment: z.enum(["cash", "interac"]),
  lang: z.string().min(2).max(5),
  partnerFullName: z.string().trim().min(1).max(120).optional().or(z.literal("")),
});

export type WalkInResult = SimpleActionResult & { enrollmentId?: string };

function guestDoorEmail(fullName: string): string {
  const slug = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
  return `walkin.${slug || "guest"}.${randomUUID().slice(0, 8)}@door.ritmokit.invalid`;
}

async function upsertDoorStudent(input: {
  fullName: string;
  email?: string;
  locale: string;
}): Promise<string> {
  const email = (input.email?.trim() || guestDoorEmail(input.fullName)).toLowerCase();
  const row = await prisma.user.upsert({
    where: { email },
    create: {
      id: randomUUID(),
      email,
      fullName: input.fullName.trim(),
      role: "STUDENT",
      locale: input.locale === "en" ? "EN" : input.locale === "es" ? "ES" : "FR",
    },
    update: { fullName: input.fullName.trim() },
    select: { id: true },
  });
  return row.id;
}

function doorPayment(kind: "cash" | "interac", now: Date): SeatPayment {
  return kind === "cash"
    ? { paid: true, paymentStatus: "PAID", paymentProvider: "CASH", paidAt: now, paymentPendingAt: null }
    : {
        paid: false,
        paymentStatus: "PENDING_INTERAC",
        paymentProvider: "INTERAC",
        paidAt: null,
        paymentPendingAt: now,
      };
}

type WalkInTxResult =
  | { kind: "not_found" }
  | { kind: "refused"; error: string }
  | { kind: "ok"; enrollmentId: string; partnerEnrollmentId: string | null; sessionId: string };

/**
 * A dancer already on file for this class walked up to the desk: convert the
 * row in place (waitlisted → seated, unpaid → paid, role fix) — but only if
 * parity still allows the seat. Runs under the class lock.
 */
async function convertExistingSeat(
  tx: Tx,
  session: LockedSession,
  existing: ExistingSeat,
  input: {
    danceRole: "LEAD" | "FOLLOW" | "SOLO";
    pricingTier: "REGULAR" | "COUPLE";
    amountCad: number;
    hint: string;
    payment: SeatPayment;
    paymentRef?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const needsSeatCheck = existing.waitlisted || existing.danceRole !== input.danceRole;
  if (needsSeatCheck) {
    const cap = await loadLockedCapacity(tx, session);
    if (!existing.waitlisted) {
      // Their current seat is being vacated by the role change.
      if (existing.danceRole === "LEAD") cap.filledLeads -= 1;
      else if (existing.danceRole === "FOLLOW") cap.filledFollows -= 1;
      else cap.filledSolos = Math.max(0, (cap.filledSolos ?? 0) - 1);
    }
    const decision = evaluateParityEnrollment(cap, input.danceRole, { allowWaitlist: false });
    if (!decision.ok) return { ok: false, error: `parity_${decision.reason}` };
  }

  // Never overwrite a PAID seat with a pending Interac state.
  const paymentData = existing.paid ? {} : input.payment;

  await tx.enrollment.update({
    where: { id: existing.id },
    data: {
      danceRole: input.danceRole,
      waitlisted: false,
      waitlistedAt: null,
      promotedAt: existing.waitlisted ? new Date() : undefined,
      pricingTier: input.pricingTier,
      amountCad: input.amountCad,
      ticketCode: existing.ticketCode ?? ticketCodeForEnrollment(existing.id),
      interacReferenceHint: input.hint,
      attended: true,
      cancellationReason: null,
      paymentCancelledAt: null,
      ...(input.paymentRef ? { paymentRef: input.paymentRef } : {}),
      ...paymentData,
    },
  });
  return { ok: true };
}

export async function walkInAtDoorAction(input: z.infer<typeof walkInSchema>): Promise<WalkInResult> {
  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user || !canAccessAccueil(user.role)) return { ok: false, error: "forbidden" };

  const { sessionId, fullName, danceRole, payment, lang } = parsed.data;
  const email = parsed.data.email?.trim() || undefined;
  const partnerFullName = parsed.data.partnerFullName?.trim() || "";
  const wantsCouple = Boolean(partnerFullName);
  if (wantsCouple && danceRole === "SOLO") return { ok: false, error: "parity_solo_not_supported" };

  try {
    const scope = await staffScope(user);

    const [studentId, partnerStudentId] = await Promise.all([
      upsertDoorStudent({ fullName, email, locale: lang }),
      wantsCouple ? upsertDoorStudent({ fullName: partnerFullName, locale: lang }) : Promise.resolve(null),
    ]);

    const now = new Date();
    const paymentData = doorPayment(payment, now);
    const pricingTier = wantsCouple ? ("COUPLE" as const) : ("REGULAR" as const);

    const result = await prisma.$transaction<WalkInTxResult>(async (tx) => {
      const session = await lockSession(tx, sessionId);
      if (!session || !sessionInLocations(session, scope.locationIds)) return { kind: "not_found" };

      const amountCad = resolveEnrollmentAmountCad(
        {
          priceRegular: session.priceRegular,
          priceCouple: session.priceCouple,
          priceStudent: session.priceStudent,
        },
        pricingTier,
      );
      const hint = `${fullName}, ${session.courseTitle}`;

      let enrollmentId: string;
      let partnerEnrollmentId: string | null = null;

      if (wantsCouple && partnerStudentId) {
        const couple = await allocateCouple(
          tx,
          session,
          {
            studentId,
            danceRole,
            allowWaitlist: false,
            pricingTier: "COUPLE",
            amountCad,
            interacReferenceHint: hint,
            payment: paymentData,
            attended: true,
          },
          {
            studentId: partnerStudentId,
            allowWaitlist: false,
            pricingTier: "COUPLE",
            amountCad: 0,
            interacReferenceHint: `${partnerFullName}, ${session.courseTitle}`,
            payment: paymentData,
            attended: true,
          },
        );
        if (couple.kind === "refused") {
          return {
            kind: "refused",
            error: couple.reason === "role_full" ? "parity_couple_full" : couple.reason,
          };
        }
        if (couple.kind === "existing" && couple.primary.kind === "existing") {
          const converted = await convertExistingSeat(tx, session, couple.primary.existing, {
            danceRole,
            pricingTier: "COUPLE",
            amountCad,
            hint,
            payment: paymentData,
          });
          if (!converted.ok) return { kind: "refused", error: converted.error };
          enrollmentId = couple.primary.enrollmentId;
          // Partner of a returning dancer: seat them as the opposite role.
          const partnerRole = danceRole === "LEAD" ? "FOLLOW" : "LEAD";
          const partnerSeat = await allocateSeat(tx, session, {
            studentId: partnerStudentId,
            danceRole: partnerRole,
            allowWaitlist: false,
            pricingTier: "COUPLE",
            amountCad: 0,
            paymentRef: `couple:${enrollmentId}`,
            interacReferenceHint: `${partnerFullName}, ${session.courseTitle}`,
            payment: paymentData,
            attended: true,
          });
          if (partnerSeat.kind === "refused") {
            return { kind: "refused", error: `parity_${partnerSeat.reason}` };
          }
          if (partnerSeat.kind === "existing") {
            const c2 = await convertExistingSeat(tx, session, partnerSeat.existing, {
              danceRole: partnerRole,
              pricingTier: "COUPLE",
              amountCad: 0,
              hint: `${partnerFullName}, ${session.courseTitle}`,
              payment: paymentData,
              paymentRef: `couple:${enrollmentId}`,
            });
            if (!c2.ok) return { kind: "refused", error: c2.error };
          }
          partnerEnrollmentId = partnerSeat.enrollmentId;
        } else if (couple.kind === "seated") {
          enrollmentId = couple.primary.enrollmentId;
          if (couple.partner.kind === "existing") {
            const c2 = await convertExistingSeat(tx, session, couple.partner.existing, {
              danceRole: danceRole === "LEAD" ? "FOLLOW" : "LEAD",
              pricingTier: "COUPLE",
              amountCad: 0,
              hint: `${partnerFullName}, ${session.courseTitle}`,
              payment: paymentData,
              paymentRef: `couple:${enrollmentId}`,
            });
            if (!c2.ok) return { kind: "refused", error: c2.error };
          }
          partnerEnrollmentId = couple.partner.enrollmentId;
        } else {
          return { kind: "refused", error: "parity_couple_full" };
        }
      } else {
        const seat = await allocateSeat(tx, session, {
          studentId,
          danceRole,
          allowWaitlist: false,
          pricingTier,
          amountCad,
          interacReferenceHint: hint,
          payment: paymentData,
          attended: true,
        });
        if (seat.kind === "refused") return { kind: "refused", error: `parity_${seat.reason}` };
        if (seat.kind === "existing") {
          const converted = await convertExistingSeat(tx, session, seat.existing, {
            danceRole,
            pricingTier,
            amountCad,
            hint,
            payment: paymentData,
          });
          if (!converted.ok) return { kind: "refused", error: converted.error };
        }
        enrollmentId = seat.enrollmentId;
      }

      const ids = partnerEnrollmentId ? [enrollmentId, partnerEnrollmentId] : [enrollmentId];

      // Cash taken at the counter is a ledger fact — recorded atomically with the
      // seat. Unique (provider, externalTransactionId, eventType) makes a retried
      // tap a no-op instead of a second credit.
      if (payment === "cash") {
        await tx.paymentEvent.createMany({
          data: [
            {
              enrollmentId,
              provider: "CASH",
              externalTransactionId: `door_cash_${enrollmentId}`,
              eventType: "payment.confirmed",
              payload: { source: "accueil_walk_in", confirmedBy: user.id, amountCad },
            },
          ],
          skipDuplicates: true,
        });
        await tx.enrollment.updateMany({
          where: { id: enrollmentId, paid: false },
          data: { paid: true, paymentStatus: "PAID", paymentProvider: "CASH", paidAt: now },
        });
        await tx.enrollment.updateMany({
          where: { id: enrollmentId, paymentConfirmedById: null },
          data: { paymentConfirmedById: user.id },
        });
      }

      // Tonight's pointage for everyone seated at the desk.
      const occurredOn = civilDateInTimeZone(now, session.timezone);
      await tx.classAttendance.createMany({
        data: ids.map((id) => ({ enrollmentId: id, occurredOn, attended: true })),
        skipDuplicates: true,
      });

      return { kind: "ok", enrollmentId, partnerEnrollmentId, sessionId: session.id };
    }, SEAT_TX_OPTIONS);

    if (result.kind === "not_found") return { ok: false, error: "not_found" };
    if (result.kind === "refused") return { ok: false, error: result.error };

    // Off the critical path: evolution stats + opposite-role waitlist unlock.
    after(async () => {
      const ids = result.partnerEnrollmentId
        ? [result.enrollmentId, result.partnerEnrollmentId]
        : [result.enrollmentId];
      await Promise.allSettled(ids.map((id) => refreshProgressionForEnrollment(id)));
      await tryPromoteWaitlist(result.sessionId).catch((error) => {
        console.error("[door] promote failed", error);
      });
    });

    revalidatePath(`/${lang}/accueil`, "page");
    revalidatePath(`/${lang}/students`, "page");
    revalidatePath(`/${lang}/dashboard`, "page");
    revalidatePath(`/${lang}/interac`, "page");
    return { ok: true, enrollmentId: result.enrollmentId };
  } catch (error) {
    return actionDatabaseError("door-walk-in", error);
  }
}
