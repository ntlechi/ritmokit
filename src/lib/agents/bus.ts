import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AgentChannel, AgentEventType } from "./schemas";

/**
 * Manually enqueue an agent task from application code (Server Actions,
 * Route Handlers). Most tasks are enqueued automatically by Postgres
 * triggers (see supabase/migrations) — use this for agent-initiated
 * follow-ups, e.g. a crisis agent that needs to schedule a re-check.
 *
 * Delegates to the `enqueue_agent_task` SQL function so the insert +
 * `pg_notify` stay atomic with whatever transaction called this.
 */
export async function enqueueAgentTask(input: {
  channel: AgentChannel;
  eventType: AgentEventType;
  relatedShiftId?: string | null;
  relatedMessageId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const rows = await prisma.$queryRaw<{ enqueue_agent_task: string }[]>`
    select enqueue_agent_task(
      ${input.channel},
      ${input.eventType},
      ${input.relatedShiftId ?? null}::uuid,
      ${JSON.stringify(input.payload ?? {})}::jsonb,
      ${input.relatedMessageId ?? null}::uuid
    )
  `;

  return rows[0].enqueue_agent_task;
}

/**
 * Marks an agent task as RUNNING (idempotent guard: only transitions
 * from PENDING, so a duplicated webhook delivery is a no-op).
 */
export async function claimAgentTask(agentLogId: string) {
  const result = await prisma.agentLog.updateMany({
    where: { id: agentLogId, status: "PENDING" },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });
  return result.count === 1;
}

export async function completeAgentTask(agentLogId: string, result: Record<string, unknown>) {
  await prisma.agentLog.update({
    where: { id: agentLogId },
    data: {
      status: "SUCCEEDED",
      result: result as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

export async function failAgentTask(agentLogId: string, error: unknown) {
  await prisma.agentLog.update({
    where: { id: agentLogId },
    data: {
      status: "FAILED",
      lastError: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
    },
  });
}
