"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { actionDatabaseError, type SimpleActionResult } from "@/lib/actions/result";
import { canAccessAccueil, canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import type { DanceAgentResult } from "@/lib/dance/agent-action-types";
import { prisma } from "@/lib/prisma";

function asResult(raw: Prisma.JsonValue | null | undefined): DanceAgentResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as unknown as DanceAgentResult;
}

async function loadLogForUser(agentLogId: string, userId: string) {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true },
  });
  if (!membership) return null;

  const log = await prisma.agentLog.findUnique({ where: { id: agentLogId } });
  if (!log || log.channel !== "agent:dance") return null;

  const result = asResult(log.result);
  if (!result || result.resolved) return null;

  if (result.sessionId) {
    const session = await prisma.classSession.findFirst({
      where: {
        id: result.sessionId,
        OR: [
          { season: { locationId: membership.locationId } },
          { room: { locationId: membership.locationId } },
        ],
      },
      select: { id: true },
    });
    if (!session) return null;
  }

  return { log, result, locationId: membership.locationId };
}

export async function dismissDanceAgentAction(input: {
  agentLogId: string;
  lang: string;
}): Promise<SimpleActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };
    if (!canAccessAccueil(user.role) && !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "forbidden" };
    }

    const loaded = await loadLogForUser(input.agentLogId, user.id);
    if (!loaded) return { ok: false, error: "not_found" };

    const next: DanceAgentResult = {
      ...loaded.result,
      resolved: true,
      resolvedAt: new Date().toISOString(),
      resolvedBy: user.id,
      resolveAction: "dismissed",
    };

    await prisma.agentLog.update({
      where: { id: input.agentLogId },
      data: { result: next as unknown as Prisma.InputJsonValue },
    });

    revalidatePath(`/${input.lang}/accueil`, "page");
    revalidatePath(`/${input.lang}/sessions`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("dismissDanceAgentAction", error);
  }
}

export async function confirmDanceAgentAction(input: {
  agentLogId: string;
  lang: string;
}): Promise<SimpleActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };
    if (!canAccessManagerSettings(user.role) && !canAccessAccueil(user.role)) {
      return { ok: false, error: "forbidden" };
    }

    const loaded = await loadLogForUser(input.agentLogId, user.id);
    if (!loaded) return { ok: false, error: "not_found" };

    const { result } = loaded;

    if (result.cta === "confirm_soft_open" && result.sessionId && result.softOpenRole) {
      const session = await prisma.classSession.findUnique({
        where: { id: result.sessionId },
        select: { id: true, maxLeads: true, maxFollows: true },
      });
      if (!session) return { ok: false, error: "session_not_found" };

      await prisma.classSession.update({
        where: { id: session.id },
        data:
          result.softOpenRole === "LEAD"
            ? { maxLeads: session.maxLeads + 1 }
            : { maxFollows: session.maxFollows + 1 },
      });
    }

    const next: DanceAgentResult = {
      ...result,
      resolved: true,
      resolvedAt: new Date().toISOString(),
      resolvedBy: user.id,
      resolveAction: "confirmed",
      autoApplied: true,
    };

    await prisma.agentLog.update({
      where: { id: input.agentLogId },
      data: { result: next as unknown as Prisma.InputJsonValue },
    });

    revalidatePath(`/${input.lang}/accueil`, "page");
    revalidatePath(`/${input.lang}/sessions`, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("confirmDanceAgentAction", error);
  }
}
