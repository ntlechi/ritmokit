/**
 * Week-by-week teaching plans attached to a Course (dance or fitness).
 */
import "server-only";

import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export type CourseLessonView = {
  id: string;
  weekNumber: number;
  title: string;
  body: string;
  videoUrl: string | null;
  musicNote: string | null;
  leadFocus: string | null;
  followFocus: string | null;
};

export type CoursePlanView = {
  courseId: string;
  title: string;
  style: string;
  level: string;
  sessionCount: number;
  lessons: CourseLessonView[];
};

export function seasonWeekNumber(startsOn: Date, today: Date): number {
  const start = Date.UTC(startsOn.getUTCFullYear(), startsOn.getUTCMonth(), startsOn.getUTCDate());
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = now - start;
  if (diff < 0) return 1;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export async function listCoursePlansForUser(
  userId: string,
  role: Role,
): Promise<{ locationName: string; organizationId: string; courses: CoursePlanView[] } | null> {
  if (!canAccessManagerSettings(role)) return null;
  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const organizationId = membership.location.organizationId;
  const courses = await prisma.course.findMany({
    where: { organizationId },
    select: {
      id: true,
      title: true,
      style: true,
      level: true,
      _count: { select: { sessions: true } },
      lessons: { orderBy: { weekNumber: "asc" } },
    },
    orderBy: [{ style: "asc" }, { title: "asc" }],
  });

  return {
    locationName: membership.location.name,
    organizationId,
    courses: courses.map((c) => ({
      courseId: c.id,
      title: c.title,
      style: c.style,
      level: c.level,
      sessionCount: c._count.sessions,
      lessons: c.lessons.map((l) => ({
        id: l.id,
        weekNumber: l.weekNumber,
        title: l.title,
        body: l.body,
        videoUrl: l.videoUrl,
        musicNote: l.musicNote,
        leadFocus: l.leadFocus,
        followFocus: l.followFocus,
      })),
    })),
  };
}

export async function findTonightLesson(
  courseId: string,
  weekNumber: number,
): Promise<CourseLessonView | null> {
  const lesson =
    (await prisma.courseLesson.findUnique({
      where: { courseId_weekNumber: { courseId, weekNumber } },
    })) ??
    (await prisma.courseLesson.findFirst({
      where: { courseId, weekNumber: { lte: weekNumber } },
      orderBy: { weekNumber: "desc" },
    }));

  if (!lesson) return null;
  return {
    id: lesson.id,
    weekNumber: lesson.weekNumber,
    title: lesson.title,
    body: lesson.body,
    videoUrl: lesson.videoUrl,
    musicNote: lesson.musicNote,
    leadFocus: lesson.leadFocus,
    followFocus: lesson.followFocus,
  };
}
