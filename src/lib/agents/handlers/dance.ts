import type { AgentLogRow } from "../schemas";

/**
 * Dance-domain agent stubs — notify / suggest only.
 * Never silent-mutate enrollments or payroll (user-confirmed writes).
 */
export async function runDanceAgent(log: AgentLogRow): Promise<Record<string, unknown>> {
  switch (log.event_type) {
    case "session.created":
      return {
        acknowledged: true,
        suggestion: "review_draft_season",
        seasonId: log.payload.seasonId ?? null,
      };
    case "session.season_published":
      return {
        acknowledged: true,
        suggestion: "notify_public_schedule_sync",
        seasonId: log.payload.seasonId ?? null,
      };
    case "enrollment.created":
      return {
        acknowledged: true,
        suggestion: "confirm_public_enrollment",
        sessionId: log.payload.sessionId ?? null,
        enrollmentId: log.payload.enrollmentId ?? null,
        waitlisted: log.payload.waitlisted ?? false,
        source: log.payload.source ?? "unknown",
      };
    case "enrollment.parity_alert":
      return {
        acknowledged: true,
        suggestion: "surface_parity_imbalance",
        sessionId: log.payload.sessionId ?? null,
        waitlisted: log.payload.waitlisted ?? false,
        // Guardrail: human must confirm any capacity overrides.
        requiresUserConfirmation: true,
      };
    case "instructor.payroll_calculated":
      return {
        acknowledged: true,
        suggestion: "review_instructor_payroll",
        requiresUserConfirmation: true,
        payrollLogId: log.payload.payrollLogId ?? null,
      };
    case "churn.risk_detected":
      return {
        acknowledged: true,
        suggestion: "review_retention_outreach",
        studentId: log.payload.studentId ?? null,
        requiresUserConfirmation: true,
      };
    default:
      return { acknowledged: true, note: "unhandled_dance_event" };
  }
}
