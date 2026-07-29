/**
 * Enqueue + process dance agent tasks inline.
 * Keeps Accueil/Sessions cards working when Supabase DB webhooks are slow or unset.
 * Claim is idempotent with the webhook path.
 */
import "server-only";

import { claimAgentTask, completeAgentTask, enqueueAgentTask, failAgentTask } from "@/lib/agents/bus";
import { runDanceAgent } from "@/lib/agents/handlers/dance";
import type { AgentEventType, AgentLogRow } from "@/lib/agents/schemas";
import { prisma } from "@/lib/prisma";

export async function enqueueAndRunDanceAgent(input: {
  eventType: AgentEventType;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const id = await enqueueAgentTask({
    channel: "agent:dance",
    eventType: input.eventType,
    payload: input.payload,
  });

  const claimed = await claimAgentTask(id);
  if (!claimed) return id;

  try {
    const row = await prisma.agentLog.findUnique({ where: { id } });
    if (!row) return id;

    const log: AgentLogRow = {
      id: row.id,
      channel: "agent:dance",
      event_type: row.eventType as AgentLogRow["event_type"],
      correlation_id: row.correlationId,
      related_shift_id: row.relatedShiftId,
      related_message_id: row.relatedMessageId,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      result: (row.result as Record<string, unknown> | null) ?? null,
      status: row.status,
      attempts: row.attempts,
      last_error: row.lastError,
    };

    const result = await runDanceAgent(log);
    await completeAgentTask(id, result);
  } catch (error) {
    await failAgentTask(id, error);
  }

  return id;
}
