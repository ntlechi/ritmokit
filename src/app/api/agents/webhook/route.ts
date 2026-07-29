import { NextResponse, type NextRequest } from "next/server";
import { claimAgentTask, completeAgentTask, failAgentTask } from "@/lib/agents/bus";
import { runDanceAgent } from "@/lib/agents/handlers/dance";
import { runLateArrivalAgent } from "@/lib/agents/handlers/late-arrival";
import { supabaseWebhookSchema, type AgentLogRow } from "@/lib/agents/schemas";

export const runtime = "nodejs";

/**
 * Entry point for the Supabase Database Webhook configured on
 * `agent_logs` (INSERT). This is the production-safe alternative to a
 * persistent `LISTEN` connection — it works on serverless runtimes and
 * gives the same end-to-end latency (~50-150ms) described in the
 * architecture plan.
 *
 * Configure in Supabase: Database > Webhooks > New webhook
 *   - Table: agent_logs, Event: Insert
 *   - URL: https://app.ritmokit.com/api/agents/webhook
 *   - HTTP header: Authorization: Bearer <AGENT_WEBHOOK_SECRET>
 */
export async function POST(request: NextRequest) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = supabaseWebhookSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", issues: parsed.error.issues }, {
      status: 400,
    });
  }

  const { record } = parsed.data;

  if (record.status !== "PENDING") {
    return NextResponse.json({ skipped: true, reason: "not_pending" });
  }

  const claimed = await claimAgentTask(record.id);
  if (!claimed) {
    return NextResponse.json({ skipped: true, reason: "already_claimed" });
  }

  try {
    const result = await dispatch(record);
    await completeAgentTask(record.id, result);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await failAgentTask(record.id, error);
    // Non-2xx tells Supabase's webhook delivery to retry with backoff.
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

async function dispatch(log: AgentLogRow): Promise<Record<string, unknown>> {
  switch (log.event_type) {
    case "shift.crisis":
      return { acknowledged: true, note: "crisis_agent_retired" };
    case "shift.overtime_detected":
    case "shift.rest_violation_detected":
      // The flag is already persisted on the shift row by the CNESST
      // trigger; this task exists purely as an auditable notification hook.
      return { acknowledged: true };
    case "shift.swap_requested":
      // Manual swap requests are surfaced directly in the UI; no
      // autonomous action needed unless negotiation stalls.
      return { acknowledged: true };
    case "chat.message_posted":
      // Intent Router: the Late Arrival Agent is the first consumer of the
      // chat pipeline. Add further intent branches here (e.g. shift swap
      // requested by chat) as the router's vocabulary grows.
      return runLateArrivalAgent(log);
    case "session.created":
    case "session.season_published":
    case "enrollment.created":
    case "enrollment.parity_alert":
    case "enrollment.paid":
    case "enrollment.waitlist_promoted":
    case "enrollment.unpaid_promote_chase":
    case "instructor.payroll_calculated":
    case "churn.risk_detected":
      return runDanceAgent(log);
    default:
      return { acknowledged: true, note: "unhandled_event_type" };
  }
}
