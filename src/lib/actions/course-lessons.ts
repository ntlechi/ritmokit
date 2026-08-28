"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessManagerSettings, getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const upsertSchema = z.object({
  courseId: z.string().uuid(),
  weekNumber: z.number().int().min(1).max(52),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(8000),
  videoUrl: z.string().trim().max(500).optional(),
  musicNote: z.string().trim().max(240).optional(),
  leadFocus: z.string().trim().max(240).optional(),
  followFocus: z.string().trim().max(240).optional(),
  lang: z.string().min(2).max(5),
});

const deleteSchema = z.object({
  lessonId: z.string().uuid(),
  lang: z.string().min(2).max(5),
});

export async function upsertCourseLessonAction(
  input: z.infer<typeof upsertSchema>,
): Promise<SimpleActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) return { ok: false, error: "forbidden" };

  const membership = await getPrimaryMembership(user.id);
  if (!membership) return { ok: false, error: "forbidden" };

  const course = await prisma.course.findFirst({
    where: { id: parsed.data.courseId, organizationId: membership.location.organizationId },
    select: { id: true },
  });
  if (!course) return { ok: false, error: "not_found" };

  const videoUrl = parsed.data.videoUrl?.trim() || null;
  const musicNote = parsed.data.musicNote?.trim() || null;
  const leadFocus = parsed.data.leadFocus?.trim() || null;
  const followFocus = parsed.data.followFocus?.trim() || null;

  try {
    await prisma.courseLesson.upsert({
      where: {
        courseId_weekNumber: {
          courseId: parsed.data.courseId,
          weekNumber: parsed.data.weekNumber,
        },
      },
      create: {
        courseId: parsed.data.courseId,
        weekNumber: parsed.data.weekNumber,
        title: parsed.data.title,
        body: parsed.data.body,
        videoUrl,
        musicNote,
        leadFocus,
        followFocus,
      },
      update: {
        title: parsed.data.title,
        body: parsed.data.body,
        videoUrl,
        musicNote,
        leadFocus,
        followFocus,
      },
    });
  } catch (error) {
    return actionDatabaseError("course-lesson", error);
  }

  revalidatePath(`/${parsed.data.lang}/plans`);
  revalidatePath(`/${parsed.data.lang}/accueil`);
  return { ok: true };
}

export async function deleteCourseLessonAction(
  input: z.infer<typeof deleteSchema>,
): Promise<SimpleActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) return { ok: false, error: "forbidden" };

  const membership = await getPrimaryMembership(user.id);
  if (!membership) return { ok: false, error: "forbidden" };

  try {
    await prisma.courseLesson.deleteMany({
      where: {
        id: parsed.data.lessonId,
        course: { organizationId: membership.location.organizationId },
      },
    });
  } catch (error) {
    return actionDatabaseError("course-lesson-delete", error);
  }

  revalidatePath(`/${parsed.data.lang}/plans`);
  revalidatePath(`/${parsed.data.lang}/accueil`);
  return { ok: true };
}
