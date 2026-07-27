import { prisma } from "@/lib/prisma";
import type { ShiftModel } from "@/generated/prisma/models";
import { getAgentPlaybookSettings } from "@/lib/rsi/playbooks";
import { detectChatIntent } from "../intents";
import type { AgentLogRow } from "../schemas";

/** Défauts — surchargés par LocationAgentConfig LATE_ARRIVAL (RSI 2). */
const DEFAULT_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_WINDOW_AFTER_MS = 6 * 60 * 60 * 1000;

type ChatMessagePayload = {
  messageId?: string;
  channelId?: string | null;
  conversationId?: string | null;
  authorId?: string;
  locationId?: string | null;
  body?: string;
};

/**
 * Agent Retard (Late Arrival Agent) — Phase 2B du pipeline d'agents sur les
 * messages de chat.
 *
 * Réveillé par le trigger Postgres `notify_chat_message_event()` pour CHAQUE
 * message humain (voir supabase/migrations/0003). Le routeur d'intents
 * décide ici si le message mérite une action : si oui, on
 *   1. retrouve le quart le plus probable de l'auteur autour de maintenant,
 *   2. le marque avec un indicateur visuel de retard potentiel,
 *   3. pousse une alerte dans le canal #gestion (Owner + Managers).
 *
 * Idempotence : `claimAgentTask` (voir bus.ts) garantit qu'un même message
 * n'est jamais traité deux fois en parallèle ; marquer un quart comme "en
 * retard" est de toute façon une opération idempotente par construction.
 */
export async function runLateArrivalAgent(log: AgentLogRow) {
  const payload = log.payload as ChatMessagePayload;
  const body = typeof payload.body === "string" ? payload.body : "";
  const intent = detectChatIntent(body);

  if (intent.type !== "late_arrival") {
    return { handled: false, reason: "no_intent_detected" };
  }

  const authorId = payload.authorId;
  if (!authorId) {
    return { handled: false, reason: "missing_author" };
  }

  const locationHint = typeof payload.locationId === "string" ? payload.locationId : null;
  const playbook = locationHint
    ? await getAgentPlaybookSettings(locationHint, "LATE_ARRIVAL")
    : null;
  const windowBeforeMs = playbook
    ? playbook.windowBeforeHours * 60 * 60 * 1000
    : DEFAULT_WINDOW_BEFORE_MS;
  const windowAfterMs = playbook
    ? playbook.windowAfterHours * 60 * 60 * 1000
    : DEFAULT_WINDOW_AFTER_MS;

  const shift = await findLikelyShift(authorId, windowBeforeMs, windowAfterMs);

  if (shift) {
    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        lateArrivalFlag: true,
        lateArrivalMinutes: intent.minutesLate,
        lateArrivalReportedAt: new Date(),
      },
    });
  }

  const locationId = payload.locationId ?? shift?.locationId ?? null;
  const alert = await pushManagementAlert({
    locationId,
    authorId,
    minutesLate: intent.minutesLate,
    shift,
    sourceMessageId: payload.messageId ?? log.id,
  });

  return {
    handled: true,
    intent: "late_arrival",
    minutesLate: intent.minutesLate,
    shiftId: shift?.id ?? null,
    alerted: alert.alerted,
    alertChannelId: alert.channelId ?? null,
    playbook: playbook ?? undefined,
  };
}

async function findLikelyShift(
  employeeId: string,
  windowBeforeMs: number,
  windowAfterMs: number,
): Promise<ShiftModel | null> {
  const now = new Date();
  const candidates = await prisma.shift.findMany({
    where: {
      employeeId,
      status: { in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] },
      startsAt: {
        gte: new Date(now.getTime() - windowBeforeMs),
        lte: new Date(now.getTime() + windowAfterMs),
      },
    },
    orderBy: { startsAt: "asc" },
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((closest, candidate) =>
    Math.abs(candidate.startsAt.getTime() - now.getTime()) <
    Math.abs(closest.startsAt.getTime() - now.getTime())
      ? candidate
      : closest,
  );
}

async function pushManagementAlert(input: {
  locationId: string | null;
  authorId: string;
  minutesLate: number;
  shift: ShiftModel | null;
  sourceMessageId: string;
}): Promise<{ alerted: boolean; channelId?: string }> {
  if (!input.locationId) return { alerted: false };

  const managementChannel = await prisma.chatChannel.findFirst({
    where: { locationId: input.locationId, type: "MANAGEMENT", isArchived: false },
  });
  if (!managementChannel) return { alerted: false };

  const [employee, spokesperson] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.authorId } }),
    resolveAlertAuthor(input.locationId, input.shift),
  ]);
  if (!spokesperson) return { alerted: false };

  const employeeName = employee?.fullName ?? "Un employé";
  const shiftLine = input.shift
    ? ` pour son quart de ${formatHm(input.shift.startsAt)}`
    : "";

  await prisma.chatMessage.create({
    data: {
      channelId: managementChannel.id,
      authorId: spokesperson.id,
      contentType: "AGENT",
      body: `⏱️ ${employeeName} a signalé un retard d'environ ${input.minutesLate} min${shiftLine}.`,
      metadata: {
        intent: "late_arrival",
        minutesLate: input.minutesLate,
        employeeId: input.authorId,
        shiftId: input.shift?.id ?? null,
        sourceMessageId: input.sourceMessageId,
      },
    },
  });

  return { alerted: true, channelId: managementChannel.id };
}

/**
 * L'alerte doit être attribuée à un utilisateur réel (FK obligatoire) même si
 * elle est visuellement rendue comme un message d'agent (`contentType:
 * "AGENT"`, voir ChannelThread). On préfère le manager qui a créé le quart
 * concerné ; à défaut, le membre Owner/Manager le plus ancien de la succursale.
 */
async function resolveAlertAuthor(locationId: string, shift: ShiftModel | null) {
  if (shift?.createdById) {
    const creator = await prisma.user.findUnique({ where: { id: shift.createdById } });
    if (creator) return creator;
  }

  const fallback = await prisma.locationMember.findFirst({
    where: { locationId, user: { role: { in: ["OWNER", "MANAGER"] } } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return fallback?.user ?? null;
}

function formatHm(date: Date) {
  return date.toLocaleTimeString("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
}
