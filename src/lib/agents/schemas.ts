import { z } from "zod";

/**
 * Canaux du bus d'agents. Chaque canal correspond à un type d'agent
 * autonome qui tourne en arrière-plan (voir supabase/migrations pour les
 * triggers qui les réveillent).
 */
export const AGENT_CHANNELS = [
  "agent:crisis",
  "agent:swap",
  "agent:cnesst",
  "agent:chat",
  "agent:dance",
] as const;
export type AgentChannel = (typeof AGENT_CHANNELS)[number];

export const AGENT_EVENT_TYPES = [
  "shift.crisis",
  "shift.swap_requested",
  "shift.overtime_detected",
  "shift.rest_violation_detected",
  "chat.message_posted",
  "session.created",
  "session.season_published",
  "enrollment.parity_alert",
  "instructor.payroll_calculated",
  "churn.risk_detected",
] as const;
export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export const agentTaskStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]);
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>;

/**
 * Forme d'une ligne `agent_logs`, telle que reçue depuis un Database
 * Webhook Supabase ou une lecture Prisma. C'est la source de vérité que
 * chaque agent relit avant d'agir (idempotence garantie par `id`).
 */
export const agentLogSchema = z.object({
  id: z.string().uuid(),
  channel: z.enum(AGENT_CHANNELS),
  event_type: z.enum(AGENT_EVENT_TYPES),
  correlation_id: z.string().uuid(),
  related_shift_id: z.string().uuid().nullable(),
  related_message_id: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  status: agentTaskStatusSchema,
  attempts: z.number().int().nonnegative(),
  last_error: z.string().nullable().optional(),
});
export type AgentLogRow = z.infer<typeof agentLogSchema>;

/**
 * Enveloppe POST envoyée par un Database Webhook Supabase configuré sur
 * la table `agent_logs` (INSERT). Voir app/api/agents/webhook/route.ts.
 */
export const supabaseWebhookSchema = z.object({
  type: z.enum(["INSERT", "UPDATE", "DELETE"]),
  table: z.literal("agent_logs"),
  schema: z.literal("public"),
  record: agentLogSchema,
  old_record: agentLogSchema.nullable().optional(),
});
export type SupabaseAgentWebhookPayload = z.infer<typeof supabaseWebhookSchema>;
