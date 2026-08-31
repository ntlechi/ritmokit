"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessAccueil, getSessionUser } from "@/lib/auth/session";
import { civilDateInTimeZone, recordClassAttendance } from "@/lib/dance/progression";
import { evaluateParityEnrollment } from "@/lib/dance/parity";
import { resolveEnrollmentAmountCad } from "@/lib/dance/pricing";
import { asPlainNumber } from "@/lib/data/serialize";
import { loadSessionCapacity } from "@/lib/public-api/capacity";
import { markEnrollmentPaid } from "@/lib/payments/mark-enrollment-paid";
import { ticketCodeForEnrollment } from "@/lib/payments/interac-status";
import { prisma } from "@/lib/prisma";

const walkInSchema = z.object({
  sessionId: z.string().uuid(),
  fullName: z.string().min(1).max(120),
  email: z.string().email().max(200).optional().or(z.literal("")),
  danceRole: z.enum(["LEAD", "FOLLOW", "SOLO"]),
  payment: z.enum(["cash", "interac"]),
  lang: z.string().min(2).max(5),
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

async function findOrCreateDoorStudent(input: {
  fullName: string;
  email?: string;
  locale: string;
}): Promise<string> {
  const email = (input.email?.trim() || guestDoorEmail(input.fullName)).toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { fullName: input.fullName.trim() },
    });
    return existing.id;
  }
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      email,
      fullName: input.fullName.trim(),
      role: "STUDENT",
      locale: input.locale === "en" ? "EN" : input.locale === "es" ? "ES" : "FR",
    },
  });
  return id;
}

export async function walkInAtDoorAction(
  input: z.infer<typeof walkInSchema>,
): Promise<WalkInResult> {
  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user || !canAccessAccueil(user.role)) return { ok: false, error: "forbidden" };

  const { sessionId, fullName, danceRole, payment, lang } = parsed.data;
  const email = parsed.data.email?.trim() || undefined;

  try {
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        priceRegular: true,
        priceCouple: true,
        priceStudent: true,
        course: { select: { title: true } },
        season: { select: { location: { select: { timezone: true } } } },
        room: { select: { location: { select: { timezone: true } } } },
      },
    });
    if (!session) return { ok: false, error: "not_found" };

    const studentId = await findOrCreateDoorStudent({
      fullName,
      email,
      locale: lang,
    });

    const amountCad = resolveEnrollmentAmountCad(
      {
        priceRegular: asPlainNumber(session.priceRegular),
        priceCouple: session.priceCouple != null ? asPlainNumber(session.priceCouple) : null,
        priceStudent: session.priceStudent != null ? asPlainNumber(session.priceStudent) : null,
      },
      "REGULAR",
    );

    const existing = await prisma.enrollment.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
      select: { id: true, paid: true, waitlisted: true, paymentStatus: true, ticketCode: true },
    });

    const enrollmentId = existing?.id ?? randomUUID();
    const ticketCode = existing?.ticketCode ?? ticketCodeForEnrollment(enrollmentId);
    const now = new Date();
    const hint = `${fullName.trim()}, ${session.course.title}`;

    const paymentData =
      payment === "cash"
        ? {
            paid: true,
            paymentStatus: "PAID" as const,
            paymentProvider: "CASH" as const,
            paidAt: now,
            paymentPendingAt: null,
          }
        : {
            paid: false,
            paymentStatus: "PENDING_INTERAC" as const,
            paymentProvider: "INTERAC" as const,
            paidAt: null,
            paymentPendingAt: now,
          };

    if (!existing) {
      const capacity = await loadSessionCapacity(sessionId);
      if (!capacity) return { ok: false, error: "not_found" };
      const decision = evaluateParityEnrollment(capacity, danceRole, { allowWaitlist: false });
      if (!decision.ok) {
        return { ok: false, error: `parity_${decision.reason}` };
      }
    }

    if (existing) {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          danceRole,
          waitlisted: false,
          waitlistedAt: null,
          amountCad,
          ticketCode,
          interacReferenceHint: hint,
          attended: true,
          cancellationReason: null,
          paymentCancelledAt: null,
          ...paymentData,
        },
      });
    } else {
      await prisma.enrollment.create({
        data: {
          id: enrollmentId,
          sessionId,
          studentId,
          danceRole,
          waitlisted: false,
          pricingTier: "REGULAR",
          amountCad,
          currency: "CAD",
          ticketCode,
          interacReferenceHint: hint,
          attended: true,
          ...paymentData,
        },
      });
    }

    if (payment === "cash") {
      await markEnrollmentPaid({
        enrollmentId,
        provider: "CASH",
        externalTransactionId: `door_cash_${enrollmentId}`,
        eventType: "payment.confirmed",
        payload: { source: "accueil_walk_in" },
        amountCad,
        confirmedById: user.id,
        skipStudentEmail: true,
      }).catch((error) => {
        console.error("[door] cash confirm", error);
      });
    }

    const timezone =
      session.season?.location.timezone || session.room.location.timezone || "America/Toronto";
    await recordClassAttendance({
      enrollmentId,
      attended: true,
      occurredOn: civilDateInTimeZone(now, timezone),
    }).catch((error) => {
      console.error("[door] attendance", error);
    });

    revalidatePath(`/${lang}/accueil`, "page");
    revalidatePath(`/${lang}/students`, "page");
    revalidatePath(`/${lang}/dashboard`, "page");
    revalidatePath(`/${lang}/interac`, "page");
    return { ok: true, enrollmentId };
  } catch (error) {
    return actionDatabaseError("door-walk-in", error);
  }
}
