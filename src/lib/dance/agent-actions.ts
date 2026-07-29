/**
 * Accueil / Sessions consumer for dance agent action cards.
 */
import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type {
  DanceAgentAction,
  DanceAgentCta,
  DanceAgentResult,
  DanceAgentSeverity,
  DanceAgentUiKind,
} from "@/lib/dance/agent-action-types";
import { prisma } from "@/lib/prisma";

const OPEN_WINDOW_MS = 48 * 60 * 60 * 1000;

function asResult(raw: Prisma.JsonValue | null | undefined): DanceAgentResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== "string" || typeof r.uiKind !== "string") return null;
  return r as unknown as DanceAgentResult;
}

function toAction(
  id: string,
  eventType: string,
  createdAt: Date,
  result: DanceAgentResult,
): DanceAgentAction {
  return {
    id,
    eventType,
    createdAt: createdAt.toISOString(),
    uiKind: result.uiKind as DanceAgentUiKind,
    title: result.title,
    body: result.body,
    severity: (result.severity ?? "info") as DanceAgentSeverity,
    sessionId: result.sessionId ?? null,
    enrollmentId: result.enrollmentId ?? null,
    cta: (result.cta ?? "none") as DanceAgentCta,
    softOpenRole: result.softOpenRole ?? null,
    requiresUserConfirmation: Boolean(result.requiresUserConfirmation),
    autoApplied: Boolean(result.autoApplied),
  };
}

/** Open (unresolved) dance actions for a location's recent classes. */
export async function getOpenDanceAgentActionsForLocation(
  locationId: string,
  options?: { sessionIds?: string[]; limit?: number },
): Promise<DanceAgentAction[]> {
  const since = new Date(Date.now() - OPEN_WINDOW_MS);
  const limit = options?.limit ?? 40;

  const sessionFilter =
    options?.sessionIds && options.sessionIds.length > 0
      ? options.sessionIds
      : (
          await prisma.classSession.findMany({
            where: {
              OR: [
                { season: { locationId } },
                { room: { locationId } },
              ],
            },
            select: { id: true },
            take: 200,
            orderBy: { startTime: "desc" },
          })
        ).map((s) => s.id);

  if (sessionFilter.length === 0) {
    // Still return churn cards (no session) for this org's recent logs.
  }

  const logs = await prisma.agentLog.findMany({
    where: {
      channel: "agent:dance",
      status: "SUCCEEDED",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      payload: true,
      result: true,
    },
  });

  const sessionSet = new Set(sessionFilter);
  const actions: DanceAgentAction[] = [];

  for (const log of logs) {
    const result = asResult(log.result);
    if (!result || result.resolved) continue;

    // Keep actionable + warning cards; skip pure noise info with cta none unless unpaid/churn.
    const interesting =
      result.cta !== "none" ||
      result.uiKind === "unpaid_promote" ||
      result.uiKind === "churn_risk" ||
      result.uiKind === "parity_imbalance" ||
      result.requiresUserConfirmation;
    if (!interesting) continue;

    const payloadSession =
      typeof (log.payload as Record<string, unknown>)?.sessionId === "string"
        ? ((log.payload as Record<string, unknown>).sessionId as string)
        : null;
    const sid = result.sessionId ?? payloadSession;

    if (sid && sessionSet.size > 0 && !sessionSet.has(sid)) {
      // Allow churn without session
      if (result.uiKind !== "churn_risk") continue;
    }

    actions.push(toAction(log.id, log.eventType, log.createdAt, result));
    if (actions.length >= limit) break;
  }

  return actions;
}

export function countActionsBySession(actions: DanceAgentAction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of actions) {
    if (!a.sessionId) continue;
    map.set(a.sessionId, (map.get(a.sessionId) ?? 0) + 1);
  }
  return map;
}
