"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessAccueil, getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const noteSchema = z.object({
  studentId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
  lang: z.string().min(2).max(5),
});

export async function addStudentNoteAction(
  input: z.infer<typeof noteSchema>,
): Promise<SimpleActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user || !canAccessAccueil(user.role)) return { ok: false, error: "forbidden" };

  const membership = await getPrimaryMembership(user.id);
  if (!membership) return { ok: false, error: "forbidden" };

  try {
    await prisma.studentNote.create({
      data: {
        studentId: parsed.data.studentId,
        locationId: membership.locationId,
        authorId: user.id,
        body: parsed.data.body,
      },
    });
  } catch (error) {
    return actionDatabaseError("student-note", error);
  }

  revalidatePath(`/${parsed.data.lang}/students`);
  revalidatePath(`/${parsed.data.lang}/students/${parsed.data.studentId}`);
  return { ok: true };
}
