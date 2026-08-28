/**
 * Periodic dance agentics: unpaid promote chase + churn risk cards.
 */
import "server-only";

import { enqueueAndRunDanceAgent } from "@/lib/agents/dance-enqueue";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import { releaseExpiredVipHolds } from "@/lib/dance/vip-hold";
import { sendEnrollmentEmail } from "@/lib/notifications/email";
import { prisma } from "@/lib/prisma";

const CHASE_WINDOW_HOURS = 24;
const REMINDER_COOLDOWN_HOURS = 6;

export async function runUnpaidPromoteChase(now = new Date()): Promise<{ chased: number }> {
  const until = new Date(now.getTime() + CHASE_WINDOW_HOURS * 60 * 60 * 1000);
  const cooldown = new Date(now.getTime() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000);

  const rows = await prisma.enrollment.findMany({
    where: {
      waitlisted: false,
      paid: false,
      promotedAt: { not: null, lte: cooldown },
      session: {
        startTime: { gte: now, lte: until },
      },
    },
    take: 40,
    select: {
      id: true,
      sessionId: true,
      studentId: true,
      danceRole: true,
      student: { select: { email: true, fullName: true, locale: true } },
      session: {
        select: {
          startTime: true,
          course: { select: { title: true } },
        },
      },
    },
  });

  const recentChase = await prisma.agentLog.findMany({
    where: {
      channel: "agent:dance",
      eventType: "enrollment.unpaid_promote_chase",
      createdAt: { gte: cooldown },
    },
    select: { payload: true },
    take: 80,
  });
  const chasedIds = new Set(
    recentChase
      .map((l) => (l.payload as Record<string, unknown>).enrollmentId)
      .filter((id): id is string => typeof id === "string"),
  );

  let chased = 0;
  for (const row of rows) {
    if (chasedIds.has(row.id)) continue;
    const locale = row.student.locale === "EN" ? "en" : row.student.locale === "ES" ? "es" : "fr";
    const title = row.session.course.title;
    const subject =
      locale === "en"
        ? `Reminder: confirm your seat — ${title}`
        : locale === "es"
          ? `Recordatorio: confirma tu lugar — ${title}`
          : `Rappel : confirmez votre place — ${title}`;
    const text =
      locale === "en"
        ? `Hi ${row.student.fullName},\n\nYour waitlist seat for ${title} is still unpaid. Please complete payment before class.\n\n— RitmoKit`
        : locale === "es"
          ? `Hola ${row.student.fullName},\n\nTu lugar de lista de espera para ${title} sigue sin pagar. Completa el pago antes de la clase.\n\n— RitmoKit`
          : `Bonjour ${row.student.fullName},\n\nVotre place (liste d'attente) pour ${title} n'est pas encore payée. Merci de finaliser avant le cours.\n\n— RitmoKit`;

    await sendEnrollmentEmail({
      to: row.student.email,
      kind: "waitlist_promoted_pay_reminder",
      subject,
      text,
      meta: { enrollmentId: row.id, sessionId: row.sessionId },
    });

    await enqueueAndRunDanceAgent({
      eventType: "enrollment.unpaid_promote_chase",
      payload: {
        enrollmentId: row.id,
        sessionId: row.sessionId,
        studentId: row.studentId,
        danceRole: row.danceRole,
        message: `${row.student.fullName} still unpaid for ${title}`,
        fullName: row.student.fullName,
      },
    });

    chased += 1;
  }

  return { chased };
}

/**
 * Paid enrollments never marked attended → churn risk cards (confirm-only; no silent email).
 */
export async function runChurnRiskProducer(): Promise<{ enqueued: number }> {
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

  const rows = await prisma.enrollment.findMany({
    where: {
      waitlisted: false,
      attended: false,
      OR: [{ paid: true }, { paymentStatus: "PAID" }],
      session: { startTime: { gte: since, lt: new Date() } },
    },
    take: 300,
    select: {
      studentId: true,
      student: { select: { fullName: true, email: true } },
      session: { select: { course: { select: { title: true } } } },
    },
  });

  type Acc = {
    fullName: string;
    email: string;
    misses: number;
    courses: Set<string>;
  };
  const map = new Map<string, Acc>();
  for (const row of rows) {
    const prev = map.get(row.studentId);
    if (!prev) {
      map.set(row.studentId, {
        fullName: row.student.fullName,
        email: row.student.email,
        misses: 1,
        courses: new Set([row.session.course.title]),
      });
    } else {
      prev.misses += 1;
      prev.courses.add(row.session.course.title);
    }
  }

  let enqueued = 0;
  const ranked = Array.from(map.entries())
    .filter(([, v]) => v.misses >= 2)
    .sort((a, b) => b[1].misses - a[1].misses)
    .slice(0, 20);

  const sinceCard = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentChurn = await prisma.agentLog.findMany({
    where: {
      channel: "agent:dance",
      eventType: "churn.risk_detected",
      createdAt: { gte: sinceCard },
    },
    select: { payload: true, result: true },
    take: 100,
  });
  const alreadyOpen = new Set<string>();
  for (const log of recentChurn) {
    const payload = log.payload as Record<string, unknown>;
    const result = log.result as Record<string, unknown> | null;
    if (result?.resolved === true) continue;
    if (typeof payload.studentId === "string") alreadyOpen.add(payload.studentId);
  }

  for (const [studentId, v] of ranked) {
    if (alreadyOpen.has(studentId)) continue;
    const courseTitles = Array.from(v.courses);
    await enqueueAndRunDanceAgent({
      eventType: "churn.risk_detected",
      payload: {
        studentId,
        fullName: v.fullName,
        email: v.email,
        unpaidAttendanceMisses: v.misses,
        courseTitles,
        draftOutreach: `Hi ${v.fullName}, we missed you in ${courseTitles.slice(0, 2).join(" / ")}. Want a quick catch-up this week?`,
      },
    });
    enqueued += 1;
  }

  return { enqueued };
}

export async function runDanceAgenticsCron(now = new Date()) {
  await ensureStudioOsSchema().catch((error) => {
    console.error("[cron] schema bootstrap", error);
  });
  const [chase, churn, holds] = await Promise.all([
    runUnpaidPromoteChase(now),
    runChurnRiskProducer(),
    releaseExpiredVipHolds(now).catch((error) => {
      console.error("[cron] vip hold expiry", error);
      return { released: 0 };
    }),
  ]);
  return { chased: chase.chased, churnEnqueued: churn.enqueued, holdsReleased: holds.released };
}
