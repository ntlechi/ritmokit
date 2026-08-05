/**
 * Interac e-Transfer reconciliation helpers (enrollment + shared status mapping).
 */
import "server-only";

import { z } from "zod";
import { asPlainNumber } from "@/lib/data/serialize";
import { tryPromoteWaitlist } from "@/lib/dance/waitlist-promote";
import { sendEnrollmentEmail } from "@/lib/notifications/email";
import { markEnrollmentPaid } from "@/lib/payments/mark-enrollment-paid";
import {
  amountToCents,
  doorStatusFromPayment,
  parseTicketCode,
  publicPaymentStatus,
  ticketCodeForEnrollment,
} from "@/lib/payments/interac-status";
import { prisma } from "@/lib/prisma";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canAccessManagerSettings } from "@/lib/auth/session-client";
import type { Role } from "@/generated/prisma/enums";

export {
  amountToCents,
  doorStatusFromPayment,
  parseTicketCode,
  publicPaymentStatus,
  ticketCodeForEnrollment,
} from "@/lib/payments/interac-status";

function waitingHours(from: Date | null | undefined, now = new Date()): number {
  if (!from) return 0;
  const ms = now.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (60 * 60 * 1000));
}

async function requireManagerLocation(userId: string, role: Role) {
  if (!canAccessManagerSettings(role)) return null;
  return getPrimaryMembership(userId);
}

export type InteracPendingItem = {
  enrollmentId: string;
  createdAt: string;
  amountCents: number;
  currency: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  courseName: string;
  classId: string;
  role: string;
  sessionLabel: string | null;
  interacReferenceHint: string | null;
  waitingHours: number;
  ticketCode: string | null;
  paymentPendingAt: string | null;
};

export async function listPendingInteracEnrollments(input: {
  userId: string;
  role: Role;
  limit?: number;
}): Promise<
  | {
      ok: true;
      items: InteracPendingItem[];
      summary: { count: number; totalAmountCents: number };
    }
  | { ok: false; error: string; status: number }
> {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false, error: "unauthorized", status: 401 };

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const rows = await prisma.enrollment.findMany({
    where: {
      paymentStatus: "PENDING_INTERAC",
      waitlisted: false,
      session: {
        OR: [
          { season: { locationId: membership.locationId } },
          { seasonId: null, room: { locationId: membership.locationId } },
        ],
      },
    },
    orderBy: [{ paymentPendingAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    include: {
      student: { select: { fullName: true, email: true, phone: true } },
      session: {
        select: {
          id: true,
          course: { select: { title: true } },
          season: { select: { name: true } },
        },
      },
    },
  });

  const items: InteracPendingItem[] = rows.map((row) => {
    const amountCad = row.amountCad != null ? asPlainNumber(row.amountCad) : 0;
    return {
      enrollmentId: row.id,
      createdAt: row.createdAt.toISOString(),
      amountCents: amountToCents(amountCad),
      currency: row.currency || "CAD",
      studentName: row.student.fullName,
      studentEmail: row.student.email,
      studentPhone: row.student.phone,
      courseName: row.session.course.title,
      classId: row.session.id,
      role: row.danceRole.toLowerCase(),
      sessionLabel: row.session.season?.name ?? null,
      interacReferenceHint: row.interacReferenceHint,
      waitingHours: waitingHours(row.paymentPendingAt ?? row.createdAt),
      ticketCode: row.ticketCode,
      paymentPendingAt: (row.paymentPendingAt ?? row.createdAt).toISOString(),
    };
  });

  const totalAmountCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  return {
    ok: true,
    items,
    summary: { count: items.length, totalAmountCents },
  };
}

export const confirmInteracSchema = z.object({
  note: z.string().trim().max(500).optional(),
  sendConfirmationEmail: z.boolean().optional().default(true),
});

export async function confirmInteracEnrollment(input: {
  userId: string;
  role: Role;
  enrollmentId: string;
  note?: string;
  sendConfirmationEmail?: boolean;
}): Promise<
  | { ok: true; alreadyProcessed: boolean; enrollmentId: string; paymentStatus: string }
  | { ok: false; error: string; status: number }
> {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false, error: "unauthorized", status: 401 };

  const row = await prisma.enrollment.findFirst({
    where: {
      id: input.enrollmentId,
      session: {
        OR: [
          { season: { locationId: membership.locationId } },
          { seasonId: null, room: { locationId: membership.locationId } },
        ],
      },
    },
    select: {
      id: true,
      paid: true,
      paymentStatus: true,
      amountCad: true,
    },
  });
  if (!row) return { ok: false, error: "enrollment_not_found", status: 404 };

  if (row.paid && row.paymentStatus === "PAID") {
    return {
      ok: true,
      alreadyProcessed: true,
      enrollmentId: row.id,
      paymentStatus: "paid",
    };
  }

  if (row.paymentStatus !== "PENDING_INTERAC" && row.paymentStatus !== "PENDING") {
    return { ok: false, error: "not_pending_interac", status: 409 };
  }

  const result = await markEnrollmentPaid({
    enrollmentId: row.id,
    provider: "INTERAC",
    externalTransactionId: `interac_confirm_${row.id}`,
    eventType: "payment.confirmed",
    payload: {
      confirmedBy: input.userId,
      note: input.note ?? null,
      sendConfirmationEmail: input.sendConfirmationEmail !== false,
      source: "studio_interac_queue",
    },
    amountCad: row.amountCad != null ? asPlainNumber(row.amountCad) : null,
    confirmedById: input.userId,
    skipStudentEmail: input.sendConfirmationEmail === false,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, status: 500 };
  }

  return {
    ok: true,
    alreadyProcessed: result.alreadyProcessed,
    enrollmentId: row.id,
    paymentStatus: "paid",
  };
}

export const cancelInteracSchema = z.object({
  reason: z.string().trim().max(500).optional().default("transfer_not_received"),
});

export async function cancelInteracEnrollment(input: {
  userId: string;
  role: Role;
  enrollmentId: string;
  reason?: string;
}): Promise<
  | { ok: true; enrollmentId: string; paymentStatus: string; promoted: number }
  | { ok: false; error: string; status: number }
> {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false, error: "unauthorized", status: 401 };

  const row = await prisma.enrollment.findFirst({
    where: {
      id: input.enrollmentId,
      session: {
        OR: [
          { season: { locationId: membership.locationId } },
          { seasonId: null, room: { locationId: membership.locationId } },
        ],
      },
    },
    include: {
      student: { select: { email: true, fullName: true, locale: true } },
      session: {
        select: {
          id: true,
          course: { select: { title: true } },
        },
      },
    },
  });
  if (!row) return { ok: false, error: "enrollment_not_found", status: 404 };

  if (row.paymentStatus === "CANCELLED_INTERAC") {
    return {
      ok: true,
      enrollmentId: row.id,
      paymentStatus: "cancelled_interac",
      promoted: 0,
    };
  }

  if (row.paymentStatus === "PAID" || row.paid) {
    return { ok: false, error: "already_paid", status: 409 };
  }

  if (row.paymentStatus !== "PENDING_INTERAC" && row.paymentStatus !== "PENDING") {
    return { ok: false, error: "not_pending_interac", status: 409 };
  }

  await prisma.$transaction([
    prisma.enrollment.update({
      where: { id: row.id },
      data: {
        paymentStatus: "CANCELLED_INTERAC",
        paid: false,
        paymentCancelledAt: new Date(),
        paymentCancelledById: input.userId,
        cancellationReason: input.reason?.trim() || "transfer_not_received",
      },
    }),
    prisma.paymentEvent.create({
      data: {
        enrollmentId: row.id,
        provider: "INTERAC",
        externalTransactionId: `interac_cancel_${row.id}_${Date.now()}`,
        eventType: "payment.cancelled",
        payload: {
          cancelledBy: input.userId,
          reason: input.reason?.trim() || "transfer_not_received",
        },
      },
    }),
  ]);

  const promoted = await tryPromoteWaitlist(row.sessionId);

  const locale = row.student.locale === "EN" ? "en" : row.student.locale === "ES" ? "es" : "fr";
  const title = row.session.course.title;
  void sendEnrollmentEmail({
    to: row.student.email,
    kind: "interac_cancelled",
    subject:
      locale === "en"
        ? `Reservation cancelled — ${title}`
        : locale === "es"
          ? `Reserva cancelada — ${title}`
          : `Réservation annulée — ${title}`,
    text:
      locale === "en"
        ? `Hi ${row.student.fullName},\n\nYour Interac reservation for ${title} was cancelled because the transfer was not received. Contact the studio if this is a mistake.\n\n— RitmoKit`
        : locale === "es"
          ? `Hola ${row.student.fullName},\n\nTu reserva Interac para ${title} fue cancelada porque no se recibió la transferencia.\n\n— RitmoKit`
          : `Bonjour ${row.student.fullName},\n\nVotre réservation Interac pour ${title} a été annulée car le virement n'a pas été reçu. Contactez le studio au besoin.\n\n— RitmoKit`,
    meta: { enrollmentId: row.id, reason: input.reason },
  });

  return {
    ok: true,
    enrollmentId: row.id,
    paymentStatus: "cancelled_interac",
    promoted: promoted.length,
  };
}

export async function getInteracStats(input: {
  userId: string;
  role: Role;
}): Promise<
  | {
      ok: true;
      stats: {
        pending: number;
        confirmedToday: number;
        confirmedWeek: number;
        cancelledWeek: number;
        avgConfirmHours: number | null;
        pendingTotalCents: number;
      };
    }
  | { ok: false; error: string; status: number }
> {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false, error: "unauthorized", status: 401 };

  const locationFilter = {
    OR: [
      { season: { locationId: membership.locationId } },
      { seasonId: null, room: { locationId: membership.locationId } },
    ],
  };

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [pendingRows, confirmedToday, confirmedWeek, cancelledWeek, confirmedSamples] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: {
          paymentStatus: "PENDING_INTERAC",
          waitlisted: false,
          session: locationFilter,
        },
        select: { amountCad: true },
      }),
      prisma.enrollment.count({
        where: {
          paymentProvider: "INTERAC",
          paymentStatus: "PAID",
          paidAt: { gte: startOfDay },
          session: locationFilter,
        },
      }),
      prisma.enrollment.count({
        where: {
          paymentProvider: "INTERAC",
          paymentStatus: "PAID",
          paidAt: { gte: weekAgo },
          session: locationFilter,
        },
      }),
      prisma.enrollment.count({
        where: {
          paymentStatus: "CANCELLED_INTERAC",
          paymentCancelledAt: { gte: weekAgo },
          session: locationFilter,
        },
      }),
      prisma.enrollment.findMany({
        where: {
          paymentProvider: "INTERAC",
          paymentStatus: "PAID",
          paidAt: { gte: weekAgo },
          paymentPendingAt: { not: null },
          session: locationFilter,
        },
        select: { paidAt: true, paymentPendingAt: true },
        take: 200,
      }),
    ]);

  let avgConfirmHours: number | null = null;
  if (confirmedSamples.length) {
    const hours = confirmedSamples
      .map((r) => {
        if (!r.paidAt || !r.paymentPendingAt) return null;
        return (r.paidAt.getTime() - r.paymentPendingAt.getTime()) / (60 * 60 * 1000);
      })
      .filter((h): h is number => h != null && h >= 0);
    if (hours.length) {
      avgConfirmHours = Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10;
    }
  }

  const pendingTotalCents = pendingRows.reduce(
    (sum, r) => sum + amountToCents(r.amountCad != null ? asPlainNumber(r.amountCad) : 0),
    0,
  );

  return {
    ok: true,
    stats: {
      pending: pendingRows.length,
      confirmedToday,
      confirmedWeek,
      cancelledWeek,
      avgConfirmHours,
      pendingTotalCents,
    },
  };
}

export async function lookupEnrollmentByTicket(input: {
  userId: string;
  role: Role;
  ticket: string;
}): Promise<
  | {
      ok: true;
      enrollment: {
        id: string;
        ticketCode: string | null;
        studentName: string;
        studentEmail: string;
        courseName: string;
        role: string;
        amountCents: number;
        currency: string;
        paymentStatus: string;
        doorStatus: "ALLOW" | "UNPAID" | "CANCELLED" | "WAITLIST";
        paid: boolean;
        attended: boolean;
      };
    }
  | { ok: false; error: string; status: number }
> {
  const { canAccessAccueil } = await import("@/lib/auth/session-client");
  if (!canAccessManagerSettings(input.role) && !canAccessAccueil(input.role)) {
    return { ok: false, error: "unauthorized", status: 401 };
  }

  const membership = await getPrimaryMembership(input.userId);
  const locationId = membership?.locationId;
  if (!locationId) return { ok: false, error: "unauthorized", status: 401 };

  const enrollmentId = parseTicketCode(input.ticket);
  if (!enrollmentId) return { ok: false, error: "invalid_ticket", status: 400 };

  const row = await prisma.enrollment.findFirst({
    where: {
      OR: [{ id: enrollmentId }, { ticketCode: input.ticket.trim() }],
      session: {
        OR: [
          { season: { locationId } },
          { seasonId: null, room: { locationId } },
        ],
      },
    },
    include: {
      student: { select: { fullName: true, email: true } },
      session: { select: { course: { select: { title: true } } } },
    },
  });
  if (!row) return { ok: false, error: "enrollment_not_found", status: 404 };

  const status = publicPaymentStatus(row.paymentStatus, row.paymentProvider);
  const doorStatus = doorStatusFromPayment({
    waitlisted: row.waitlisted,
    paid: row.paid,
    paymentStatus: row.paymentStatus,
  });

  return {
    ok: true,
    enrollment: {
      id: row.id,
      ticketCode: row.ticketCode,
      studentName: row.student.fullName,
      studentEmail: row.student.email,
      courseName: row.session.course.title,
      role: row.danceRole.toLowerCase(),
      amountCents: amountToCents(row.amountCad != null ? asPlainNumber(row.amountCad) : 0),
      currency: row.currency || "CAD",
      paymentStatus: status,
      doorStatus,
      paid: row.paid,
      attended: row.attended,
    },
  };
}

export async function notifyStaffPendingInterac(input: {
  locationId: string;
  enrollmentId: string;
  studentName: string;
  courseName: string;
  amountCad: number;
}): Promise<void> {
  const settings = await prisma.locationInteracSettings.findUnique({
    where: { locationId: input.locationId },
  });
  if (settings && !settings.alertOnPending) return;

  const to =
    settings?.notifyStaffEmail?.trim() ||
    process.env.INTERAC_NOTIFY_EMAIL?.trim() ||
    process.env.RENTAL_NOTIFY_EMAIL?.trim() ||
    "";

  const amountLabel = `${input.amountCad.toFixed(2).replace(".", ",")} $`;
  await sendEnrollmentEmail({
    to,
    kind: "interac_pending_staff",
    subject: `Nouveau virement à confirmer · ${amountLabel} · ${input.studentName} · ${input.courseName}`,
    text: [
      `Nouveau virement Interac en attente.`,
      `Élève: ${input.studentName}`,
      `Cours: ${input.courseName}`,
      `Montant: ${amountLabel}`,
      `Enrollment: ${input.enrollmentId}`,
      ``,
      `Comparez le montant dans votre courriel Interac, puis confirmez dans RitmoKit → Interac.`,
    ].join("\n"),
    meta: {
      enrollmentId: input.enrollmentId,
      locationId: input.locationId,
      amountCad: input.amountCad,
    },
  });
}

export const interacSettingsPatchSchema = z.object({
  depositEmail: z.string().email().max(200).nullable().optional(),
  securityQuestion: z.string().trim().max(200).nullable().optional(),
  passwordHint: z.string().trim().max(200).nullable().optional(),
  inboxUrl: z.string().trim().max(500).nullable().optional(),
  notifyStaffEmail: z.string().email().max(200).nullable().optional(),
  alertOnPending: z.boolean().optional(),
});

export async function patchInteracSettings(input: {
  userId: string;
  role: Role;
  payload: z.infer<typeof interacSettingsPatchSchema>;
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const settings = await prisma.locationInteracSettings.upsert({
    where: { locationId: membership.locationId },
    create: {
      locationId: membership.locationId,
      depositEmail: input.payload.depositEmail ?? null,
      securityQuestion: input.payload.securityQuestion ?? null,
      passwordHint: input.payload.passwordHint ?? null,
      inboxUrl: input.payload.inboxUrl ?? null,
      notifyStaffEmail: input.payload.notifyStaffEmail ?? null,
      alertOnPending: input.payload.alertOnPending ?? true,
    },
    update: {
      ...(input.payload.depositEmail !== undefined
        ? { depositEmail: input.payload.depositEmail }
        : {}),
      ...(input.payload.securityQuestion !== undefined
        ? { securityQuestion: input.payload.securityQuestion }
        : {}),
      ...(input.payload.passwordHint !== undefined
        ? { passwordHint: input.payload.passwordHint }
        : {}),
      ...(input.payload.inboxUrl !== undefined ? { inboxUrl: input.payload.inboxUrl } : {}),
      ...(input.payload.notifyStaffEmail !== undefined
        ? { notifyStaffEmail: input.payload.notifyStaffEmail }
        : {}),
      ...(input.payload.alertOnPending !== undefined
        ? { alertOnPending: input.payload.alertOnPending }
        : {}),
    },
  });

  return {
    ok: true as const,
    settings: {
      depositEmail: settings.depositEmail,
      securityQuestion: settings.securityQuestion,
      passwordHint: settings.passwordHint,
      inboxUrl: settings.inboxUrl,
      notifyStaffEmail: settings.notifyStaffEmail,
      alertOnPending: settings.alertOnPending,
    },
  };
}

export async function getInteracDashboardData(userId: string, role: Role) {
  const membership = await requireManagerLocation(userId, role);
  if (!membership) return null;

  const [pending, stats, settings] = await Promise.all([
    listPendingInteracEnrollments({ userId, role, limit: 50 }),
    getInteracStats({ userId, role }),
    prisma.locationInteracSettings.findUnique({ where: { locationId: membership.locationId } }),
  ]);

  if (!pending.ok || !stats.ok) return null;

  return {
    locationId: membership.locationId,
    pending: pending.items,
    summary: pending.summary,
    stats: stats.stats,
    settings: settings
      ? {
          depositEmail: settings.depositEmail,
          securityQuestion: settings.securityQuestion,
          passwordHint: settings.passwordHint,
          inboxUrl: settings.inboxUrl,
          notifyStaffEmail: settings.notifyStaffEmail,
          alertOnPending: settings.alertOnPending,
        }
      : {
          depositEmail: null,
          securityQuestion: null,
          passwordHint: null,
          inboxUrl: null,
          notifyStaffEmail: null,
          alertOnPending: true,
        },
  };
}
