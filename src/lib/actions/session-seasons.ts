"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueAgentTask } from "@/lib/agents/bus";
import { canDeleteSeason, planSeasonPublish, shouldAutoPublish } from "@/lib/dance/lifecycle";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(160),
  startsOn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  endsOn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  publishOn: z.string().optional().nullable(),
  lang: z.string().min(2).max(5),
});

export async function createSessionSeasonAction(
  input: z.infer<typeof createSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  try {
    const season = await prisma.sessionSeason.create({
      data: {
        locationId: parsed.data.locationId,
        name: parsed.data.name,
        status: "DRAFT",
        bookingOpen: false,
        startsOn: new Date(parsed.data.startsOn),
        endsOn: new Date(parsed.data.endsOn),
        publishOn: parsed.data.publishOn ? new Date(parsed.data.publishOn) : null,
      },
    });

    await enqueueAgentTask({
      channel: "agent:dance",
      eventType: "session.created",
      payload: {
        seasonId: season.id,
        locationId: season.locationId,
        name: season.name,
        createdById: user.id,
      },
    });

    revalidatePath(`/${parsed.data.lang}/sessions`, "page");
    return { ok: true, id: season.id };
  } catch (error) {
    return actionDatabaseError("createSessionSeason", error) as { ok: false; error: string };
  }
}

export async function publishSessionSeasonAction(input: {
  seasonId: string;
  lang: string;
}): Promise<SimpleActionResult> {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  try {
    const seasons = await prisma.sessionSeason.findMany({
      where: {
        location: {
          members: { some: { userId: user.id } },
        },
      },
      select: { id: true, status: true, bookingOpen: true, publishOn: true, locationId: true },
    });

    const plan = planSeasonPublish(seasons, input.seasonId);
    if (!plan.ok) return { ok: false, error: plan.reason };

    await prisma.$transaction([
      ...plan.archivedIds.map((id) =>
        prisma.sessionSeason.update({
          where: { id },
          data: { status: "ARCHIVED", bookingOpen: false },
        }),
      ),
      prisma.sessionSeason.update({
        where: { id: plan.publishedId },
        data: { status: "ACTIVE", bookingOpen: true },
      }),
    ]);

    const published = seasons.find((s) => s.id === plan.publishedId);
    await enqueueAgentTask({
      channel: "agent:dance",
      eventType: "session.season_published",
      payload: {
        seasonId: plan.publishedId,
        locationId: published?.locationId,
        archivedIds: plan.archivedIds,
        publishedById: user.id,
      },
    });

    revalidatePath(`/${input.lang}/sessions`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("publishSessionSeason", error);
  }
}

export async function runScheduledSeasonPublishesAction(): Promise<{
  ok: true;
  published: string[];
}> {
  const drafts = await prisma.sessionSeason.findMany({
    where: { status: "DRAFT", publishOn: { not: null } },
    select: { id: true, status: true, bookingOpen: true, publishOn: true, locationId: true },
  });

  const published: string[] = [];
  for (const draft of drafts) {
    if (!shouldAutoPublish(draft)) continue;
    const siblings = await prisma.sessionSeason.findMany({
      where: { locationId: draft.locationId },
      select: { id: true, status: true, bookingOpen: true, publishOn: true },
    });
    const plan = planSeasonPublish(siblings, draft.id);
    if (!plan.ok) continue;

    await prisma.$transaction([
      ...plan.archivedIds.map((id) =>
        prisma.sessionSeason.update({
          where: { id },
          data: { status: "ARCHIVED", bookingOpen: false },
        }),
      ),
      prisma.sessionSeason.update({
        where: { id: plan.publishedId },
        data: { status: "ACTIVE", bookingOpen: true },
      }),
    ]);

    await enqueueAgentTask({
      channel: "agent:dance",
      eventType: "session.season_published",
      payload: { seasonId: plan.publishedId, locationId: draft.locationId, auto: true },
    });
    published.push(plan.publishedId);
  }

  return { ok: true, published };
}

export async function deleteSessionSeasonAction(input: {
  seasonId: string;
  lang: string;
}): Promise<SimpleActionResult> {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  try {
    const season = await prisma.sessionSeason.findUnique({ where: { id: input.seasonId } });
    if (!season) return { ok: false, error: "not_found" };
    if (!canDeleteSeason(season.status)) return { ok: false, error: "cannot_delete_active" };

    await prisma.sessionSeason.delete({ where: { id: input.seasonId } });
    revalidatePath(`/${input.lang}/sessions`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("deleteSessionSeason", error);
  }
}
