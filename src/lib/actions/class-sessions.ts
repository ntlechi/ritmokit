"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionDatabaseError } from "@/lib/actions/result";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  lang: z.string().min(2).max(5),
  seasonId: z.string().uuid().nullable().optional(),
  courseId: z.string().uuid(),
  roomId: z.string().uuid(),
  instructorId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  maxLeads: z.number().int().min(0).max(200).default(12),
  maxFollows: z.number().int().min(0).max(200).default(12),
  priceRegular: z.number().min(0).max(10_000),
  priceCouple: z.number().min(0).max(10_000).nullable().optional(),
  priceStudent: z.number().min(0).max(10_000).nullable().optional(),
});

const courseSchema = z.object({
  lang: z.string().min(2).max(5),
  organizationId: z.string().uuid(),
  title: z.string().min(1).max(160),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  style: z.string().min(1).max(80),
});

function revalidateSessions(lang: string) {
  revalidatePath(`/${lang}/sessions`, "page");
  revalidatePath(`/${lang}/dashboard`, "page");
}

export async function createCourseAction(
  input: z.infer<typeof courseSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  try {
    const course = await prisma.course.create({
      data: {
        organizationId: parsed.data.organizationId,
        title: parsed.data.title.trim(),
        level: parsed.data.level,
        style: parsed.data.style.trim(),
      },
    });
    revalidateSessions(parsed.data.lang);
    return { ok: true, id: course.id };
  } catch (error) {
    return actionDatabaseError("createCourse", error) as { ok: false; error: string };
  }
}

export async function createClassSessionAction(
  input: z.infer<typeof createSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "invalid_times" };
  }

  try {
    const session = await prisma.classSession.create({
      data: {
        seasonId: parsed.data.seasonId ?? null,
        courseId: parsed.data.courseId,
        roomId: parsed.data.roomId,
        instructorId: parsed.data.instructorId,
        dayOfWeek: parsed.data.dayOfWeek ?? null,
        startTime: start,
        endTime: end,
        maxLeads: parsed.data.maxLeads,
        maxFollows: parsed.data.maxFollows,
        priceRegular: parsed.data.priceRegular,
        priceCouple: parsed.data.priceCouple ?? null,
        priceStudent: parsed.data.priceStudent ?? null,
      },
    });
    revalidateSessions(parsed.data.lang);
    return { ok: true, id: session.id };
  } catch (error) {
    return actionDatabaseError("createClassSession", error) as { ok: false; error: string };
  }
}

const updateSchema = z.object({
  lang: z.string().min(2).max(5),
  sessionId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  instructorId: z.string().uuid().optional(),
  maxLeads: z.number().int().min(0).max(200).optional(),
  maxFollows: z.number().int().min(0).max(200).optional(),
  priceRegular: z.number().min(0).max(10_000).optional(),
  priceCouple: z.number().min(0).max(10_000).nullable().optional(),
  priceStudent: z.number().min(0).max(10_000).nullable().optional(),
});

export async function updateClassSessionAction(
  input: z.infer<typeof updateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  const { sessionId, lang, ...patch } = parsed.data;
  const data: Record<string, unknown> = {};
  if (patch.roomId != null) data.roomId = patch.roomId;
  if (patch.instructorId != null) data.instructorId = patch.instructorId;
  if (patch.maxLeads != null) data.maxLeads = patch.maxLeads;
  if (patch.maxFollows != null) data.maxFollows = patch.maxFollows;
  if (patch.priceRegular != null) data.priceRegular = patch.priceRegular;
  if (patch.priceCouple !== undefined) data.priceCouple = patch.priceCouple;
  if (patch.priceStudent !== undefined) data.priceStudent = patch.priceStudent;

  if (Object.keys(data).length === 0) return { ok: false, error: "invalid_input" };

  try {
    await prisma.classSession.update({ where: { id: sessionId }, data });
    revalidateSessions(lang);
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("updateClassSession", error) as { ok: false; error: string };
  }
}

export async function deleteClassSessionAction(input: {
  sessionId: string;
  lang: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  try {
    await prisma.classSession.delete({ where: { id: input.sessionId } });
    revalidateSessions(input.lang);
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("deleteClassSession", error) as { ok: false; error: string };
  }
}
