"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessAccueil, canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { nextCourseLevel, refreshProgressionForEnrollment } from "@/lib/dance/progression";
import { sendEnrollmentEmail } from "@/lib/notifications/email";
import { resolvePublicBookingBaseUrl } from "@/lib/public-api/booking-return";
import { prisma } from "@/lib/prisma";

const evaluateSchema = z.object({
  enrollmentId: z.string().uuid(),
  status: z.enum(["READY_TO_ADVANCE", "NEEDS_REVIEW", "COMPLETED", "IN_PROGRESS"]),
  lang: z.string().min(2).max(5),
});

export async function evaluateProgressionAction(
  input: z.infer<typeof evaluateSchema>,
): Promise<SimpleActionResult> {
  const parsed = evaluateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!canAccessAccueil(user.role) && !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "forbidden" };
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: {
      studentId: true,
      session: { select: { courseId: true, seasonId: true } },
    },
  });
  if (!enrollment?.session.seasonId) return { ok: false, error: "not_found" };

  try {
    await refreshProgressionForEnrollment(parsed.data.enrollmentId);
    await prisma.studentProgression.update({
      where: {
        studentId_courseId_seasonId: {
          studentId: enrollment.studentId,
          courseId: enrollment.session.courseId,
          seasonId: enrollment.session.seasonId,
        },
      },
      data: {
        status: parsed.data.status,
        evaluatedById: user.id,
        evaluatedAt: new Date(),
      },
    });
  } catch (error) {
    return actionDatabaseError("evaluate-progression", error);
  }

  revalidatePath(`/${parsed.data.lang}/accueil`);
  revalidatePath(`/${parsed.data.lang}/students`);
  revalidatePath(`/${parsed.data.lang}/dashboard`);
  return { ok: true };
}

const inviteSchema = z.object({
  progressionId: z.string().uuid(),
  lang: z.string().min(2).max(5),
});

export async function inviteReadyStudentAction(
  input: z.infer<typeof inviteSchema>,
): Promise<SimpleActionResult & { sent?: boolean }> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) return { ok: false, error: "forbidden" };

  const row = await prisma.studentProgression.findUnique({
    where: { id: parsed.data.progressionId },
    select: {
      id: true,
      status: true,
      currentLevel: true,
      danceStyle: true,
      locationId: true,
      student: { select: { fullName: true, email: true, locale: true } },
      course: { select: { title: true } },
    },
  });
  if (!row || row.status !== "READY_TO_ADVANCE") return { ok: false, error: "not_ready" };

  const next = nextCourseLevel(row.currentLevel);
  const locale = row.student.locale === "EN" ? "en" : row.student.locale === "ES" ? "es" : "fr";
  const base =
    (await resolvePublicBookingBaseUrl(row.locationId)) ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://salsaquebec.com";
  const bookingUrl = `${base.replace(/\/+$/, "")}/horaire`;
  const nextLabel =
    next === "INTERMEDIATE"
      ? locale === "en"
        ? "Level 2"
        : locale === "es"
          ? "Nivel 2"
          : "Niveau 2"
      : next === "ADVANCED"
        ? locale === "en"
          ? "Level 3"
          : locale === "es"
            ? "Nivel 3"
            : "Niveau 3"
        : locale === "en"
          ? "the next session"
          : locale === "es"
            ? "la próxima temporada"
            : "la prochaine session";

  const subject =
    locale === "en"
      ? `Your place in ${row.danceStyle} ${nextLabel}`
      : locale === "es"
        ? `Tu plaza en ${row.danceStyle} ${nextLabel}`
        : `Ta place en ${row.danceStyle} ${nextLabel}`;
  const text =
    locale === "en"
      ? `Hi ${row.student.fullName},\n\nCongratulations on completing ${row.course.title}. Your spot for ${row.danceStyle} ${nextLabel} is held in priority — enroll here:\n${bookingUrl}\n\n— ${user.fullName}`
      : locale === "es"
        ? `Hola ${row.student.fullName},\n\nFelicidades por completar ${row.course.title}. Tu plaza para ${row.danceStyle} ${nextLabel} está en prioridad — inscríbete aquí:\n${bookingUrl}\n\n— ${user.fullName}`
        : `Salut ${row.student.fullName},\n\nFélicitations pour ${row.course.title}. Ta place pour ${row.danceStyle} ${nextLabel} est prioritaire 48 h — inscris-toi ici :\n${bookingUrl}\n\n— ${user.fullName}`;

  const email = await sendEnrollmentEmail({
    to: row.student.email,
    kind: "progression_ready_invite",
    subject,
    text,
    meta: { progressionId: row.id, style: row.danceStyle },
  });

  try {
    await prisma.studentProgression.update({
      where: { id: row.id },
      data: { inviteSentAt: new Date() },
    });
  } catch (error) {
    return actionDatabaseError("invite-ready", error);
  }

  revalidatePath(`/${parsed.data.lang}/students`);
  return { ok: true, sent: email.sent };
}
