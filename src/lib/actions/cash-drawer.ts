"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { actionDatabaseError } from "@/lib/actions/result";
import { canAccessAccueil, getSessionUser } from "@/lib/auth/session";
import {
  businessNightWindow,
  DRAWER_VARIANCE_TOLERANCE_CENTS,
  loadDrawerSnapshot,
} from "@/lib/data/cash-drawer";
import { canAccessLocation } from "@/lib/locations/active-location";
import { centsToCad, isWholeCents, toCents } from "@/lib/money/cents";
import { prisma } from "@/lib/prisma";

const cad = z
  .number()
  .min(0)
  .max(100_000)
  .refine(isWholeCents, { message: "whole_cents" });

const closeSchema = z.object({
  locationId: z.string().uuid(),
  startFloatCad: cad,
  countedCad: cad,
  note: z.string().max(500).optional().or(z.literal("")),
  lang: z.string().min(2).max(5),
});

export type CloseDrawerResult =
  | {
      ok: true;
      expectedCad: number;
      countedCad: number;
      varianceCad: number;
      depositCad: number;
    }
  | { ok: false; error: string; closedAt?: string };

/**
 * Close tonight's drawer: expected = float + cash taken at the door; variance =
 * counted − expected; deposit = counted − float (the float stays in the drawer).
 * All arithmetic in integer cents. Idempotent per (location, business night):
 * the unique index is the arbiter, so two tablets closing at once yield one row.
 */
export async function closeCashDrawerAction(
  input: z.infer<typeof closeSchema>,
): Promise<CloseDrawerResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await getSessionUser();
  if (!user || !canAccessAccueil(user.role)) return { ok: false, error: "forbidden" };

  const { locationId, lang } = parsed.data;
  const note = parsed.data.note?.trim() || null;

  try {
    // Brand-scoped: owners reach every site of their organisation, never another tenant's.
    if (!(await canAccessLocation(user.id, user.role, locationId))) {
      return { ok: false, error: "forbidden" };
    }
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { timezone: true },
    });
    if (!location) return { ok: false, error: "not_found" };

    const timeZone = location.timezone || "America/Toronto";
    const now = new Date();
    const snapshot = await loadDrawerSnapshot(locationId, timeZone, now);
    if (snapshot.closed) {
      return { ok: false, error: "already_closed", closedAt: snapshot.closed.closedAt };
    }

    const startFloatCents = toCents(parsed.data.startFloatCad);
    const countedCents = toCents(parsed.data.countedCad);
    const expectedCents = startFloatCents + snapshot.cashCents;
    const varianceCents = countedCents - expectedCents;
    const depositCents = Math.max(0, countedCents - startFloatCents);
    if (Math.abs(varianceCents) > DRAWER_VARIANCE_TOLERANCE_CENTS && !note) {
      return { ok: false, error: "note_required" };
    }

    const { businessDateUtc } = businessNightWindow(now, timeZone);
    try {
      await prisma.cashDrawerClose.create({
        data: {
          locationId,
          closedById: user.id,
          businessDate: businessDateUtc,
          startFloatCad: centsToCad(startFloatCents),
          cashDoorCad: centsToCad(snapshot.cashCents),
          cashDoorCount: snapshot.cashCount,
          interacDoorCad: centsToCad(snapshot.interacCents),
          interacDoorCount: snapshot.interacCount,
          expectedCad: centsToCad(expectedCents),
          countedCad: centsToCad(countedCents),
          varianceCad: centsToCad(varianceCents),
          depositCad: centsToCad(depositCents),
          note,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, error: "already_closed", closedAt: now.toISOString() };
      }
      throw error;
    }

    revalidatePath(`/${lang}/accueil`);
    revalidatePath(`/${lang}/dashboard`);
    return {
      ok: true,
      expectedCad: centsToCad(expectedCents),
      countedCad: centsToCad(countedCents),
      varianceCad: centsToCad(varianceCents),
      depositCad: centsToCad(depositCents),
    };
  } catch (error) {
    return actionDatabaseError("cash-drawer.close", error);
  }
}
