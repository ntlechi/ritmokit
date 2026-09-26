"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionDatabaseError } from "@/lib/actions/result";
import { canAccessAccueil, getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { INTAKE_BOARD_ORDER } from "@/lib/dance/intake-rules";
import { listIntakes, type IntakePage, type IntakeRow } from "@/lib/data/intake";
import { prisma } from "@/lib/prisma";

const statusSchema = z.enum(INTAKE_BOARD_ORDER);

const updateSchema = z
  .object({
    intakeId: z.string().uuid(),
    status: statusSchema.optional(),
    assignedToId: z.string().uuid().nullable().optional(),
    lang: z.string().min(2).max(5),
  })
  .refine((v) => v.status !== undefined || v.assignedToId !== undefined, {
    message: "nothing_to_update",
  });

export type UpdateIntakeResult =
  | { ok: true; row: Pick<IntakeRow, "id" | "status" | "assignedToId" | "contactedAt"> }
  | { ok: false; error: string };

/** Staff at the active location only; the intake must belong to it. */
async function resolveStaffLocation() {
  const user = await getSessionUser();
  if (!user || !canAccessAccueil(user.role)) return null;
  const membership = await getPrimaryMembership(user.id);
  if (!membership) return null;
  return { user, locationId: membership.locationId };
}

export async function updateIntakeAction(
  input: z.infer<typeof updateSchema>,
): Promise<UpdateIntakeResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const ctx = await resolveStaffLocation();
  if (!ctx) return { ok: false, error: "forbidden" };
  const { intakeId, status, assignedToId, lang } = parsed.data;

  try {
    const intake = await prisma.studentIntake.findFirst({
      where: { id: intakeId, locationId: ctx.locationId },
      select: { id: true, contactedAt: true },
    });
    if (!intake) return { ok: false, error: "not_found" };

    if (assignedToId) {
      const member = await prisma.locationMember.findFirst({
        where: { locationId: ctx.locationId, userId: assignedToId },
        select: { id: true },
      });
      if (!member) return { ok: false, error: "invalid_assignee" };
    }

    const updated = await prisma.studentIntake.update({
      where: { id: intake.id },
      data: {
        ...(status ? { status } : {}),
        ...(status === "CONTACTED" && !intake.contactedAt ? { contactedAt: new Date() } : {}),
        ...(assignedToId !== undefined ? { assignedToId } : {}),
      },
      select: { id: true, status: true, assignedToId: true, contactedAt: true },
    });

    revalidatePath(`/${lang}/students/new`);
    return {
      ok: true,
      row: { ...updated, contactedAt: updated.contactedAt?.toISOString() ?? null },
    };
  } catch (error) {
    return actionDatabaseError("intake-update", error);
  }
}

const pageSchema = z.object({
  status: statusSchema,
  cursor: z.string().uuid(),
});

export async function loadMoreIntakesAction(
  input: z.infer<typeof pageSchema>,
): Promise<{ ok: true; page: IntakePage } | { ok: false; error: string }> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const ctx = await resolveStaffLocation();
  if (!ctx) return { ok: false, error: "forbidden" };

  try {
    const page = await listIntakes(ctx.locationId, [parsed.data.status], {
      cursor: parsed.data.cursor,
    });
    return { ok: true, page };
  } catch (error) {
    return actionDatabaseError("intake-page", error);
  }
}
