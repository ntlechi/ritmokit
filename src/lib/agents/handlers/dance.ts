import "server-only";

import type { AgentLogRow } from "../schemas";
import type { DanceAgentResult } from "@/lib/dance/agent-action-types";
import { prisma } from "@/lib/prisma";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asCapacity(payload: Record<string, unknown>): DanceAgentResult["capacity"] {
  const raw = payload.capacity;
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const n = (k: string) => (typeof c[k] === "number" ? c[k] : Number(c[k]));
  return {
    filledLeads: n("filledLeads") || 0,
    filledFollows: n("filledFollows") || 0,
    maxLeads: n("maxLeads") || 0,
    maxFollows: n("maxFollows") || 0,
  };
}

async function loadSessionCapacity(sessionId: string | null) {
  if (!sessionId) return null;
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: {
      maxLeads: true,
      maxFollows: true,
      course: { select: { title: true } },
      enrollments: {
        where: {
          waitlisted: false,
          paymentStatus: { not: "CANCELLED_INTERAC" },
        },
        select: { danceRole: true },
      },
    },
  });
  if (!session) return null;
  let filledLeads = 0;
  let filledFollows = 0;
  for (const e of session.enrollments) {
    if (e.danceRole === "LEAD") filledLeads += 1;
    else if (e.danceRole === "FOLLOW") filledFollows += 1;
  }
  return {
    title: session.course.title,
    capacity: {
      filledLeads,
      filledFollows,
      maxLeads: session.maxLeads,
      maxFollows: session.maxFollows,
    },
  };
}

function softOpenRoleFromCapacity(
  capacity: NonNullable<DanceAgentResult["capacity"]>,
): "LEAD" | "FOLLOW" | null {
  if (capacity.filledFollows - capacity.filledLeads >= 1) return "LEAD";
  if (capacity.filledLeads - capacity.filledFollows >= 1) return "FOLLOW";
  return null;
}

function base(
  partial: Omit<DanceAgentResult, "acknowledged" | "resolved" | "resolvedAt" | "resolvedBy" | "resolveAction">,
): DanceAgentResult {
  return {
    acknowledged: true,
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    resolveAction: null,
    ...partial,
  };
}

/**
 * Dance-domain agent — builds Accueil/Sessions action payloads.
 * Safe lifecycle side effects (promote/email) run elsewhere; this handler
 * never silent-mutates capacity (soft-open requires user confirmation).
 */
export async function runDanceAgent(log: AgentLogRow): Promise<DanceAgentResult> {
  const sessionId = asString(log.payload.sessionId);
  const enrollmentId = asString(log.payload.enrollmentId);
  const studentId = asString(log.payload.studentId);

  switch (log.event_type) {
    case "session.created":
      return base({
        suggestion: "review_draft_season",
        uiKind: "info",
        title: "Season draft ready",
        body: "Review the draft season before publishing the public schedule.",
        severity: "info",
        sessionId,
        enrollmentId,
        studentId,
        cta: "none",
        autoApplied: false,
        requiresUserConfirmation: false,
        softOpenRole: null,
        capacity: null,
        draftOutreach: null,
      });

    case "session.season_published":
      return base({
        suggestion: "notify_public_schedule_sync",
        uiKind: "info",
        title: "Season published",
        body: "Public schedule is live — confirm the website widget is in sync.",
        severity: "info",
        sessionId,
        enrollmentId,
        studentId,
        cta: "none",
        autoApplied: true,
        requiresUserConfirmation: false,
        softOpenRole: null,
        capacity: null,
        draftOutreach: null,
      });

    case "enrollment.created": {
      const waitlisted = Boolean(log.payload.waitlisted);
      return base({
        suggestion: "confirm_public_enrollment",
        uiKind: "info",
        title: waitlisted ? "Student waitlisted" : "Enrollment recorded",
        body: waitlisted
          ? "Seat held on waitlist — promote runs automatically when a spot opens."
          : "Enrollment saved. Checkout may be pending payment.",
        severity: "info",
        sessionId,
        enrollmentId,
        studentId,
        cta: "none",
        autoApplied: true,
        requiresUserConfirmation: false,
        softOpenRole: null,
        capacity: asCapacity(log.payload),
        draftOutreach: null,
      });
    }

    case "enrollment.parity_alert": {
      const live = await loadSessionCapacity(sessionId);
      const capacity = live?.capacity ?? asCapacity(log.payload);
      const softOpenRole = capacity ? softOpenRoleFromCapacity(capacity) : null;
      const needLabel =
        softOpenRole === "LEAD" ? "Leads" : softOpenRole === "FOLLOW" ? "Follows" : "partners";
      const counts = capacity
        ? `L ${capacity.filledLeads}/${capacity.maxLeads} · F ${capacity.filledFollows}/${capacity.maxFollows}`
        : "Parity imbalance detected";
      return base({
        suggestion: "surface_parity_imbalance",
        uiKind: "parity_imbalance",
        title: live?.title
          ? `Parity: ${live.title} needs ${needLabel}`
          : `Parity: needs ${needLabel}`,
        body: `${counts}. Soft-open adds one seat on the short side (one tap).`,
        severity: "warning",
        sessionId,
        enrollmentId,
        studentId,
        cta: softOpenRole ? "confirm_soft_open" : "dismiss",
        autoApplied: false,
        requiresUserConfirmation: true,
        softOpenRole,
        capacity,
        draftOutreach: null,
      });
    }

    case "enrollment.paid":
      return base({
        suggestion: "record_payment_confirmed",
        uiKind: "info",
        title: "Payment confirmed",
        body: "Enrollment marked PAID — waitlist promote may have run for the opposite role.",
        severity: "info",
        sessionId,
        enrollmentId,
        studentId,
        cta: "none",
        autoApplied: true,
        requiresUserConfirmation: false,
        softOpenRole: null,
        capacity: null,
        draftOutreach: null,
      });

    case "enrollment.waitlist_promoted": {
      const paid = Boolean(log.payload.paid);
      const role = asString(log.payload.danceRole) ?? "dancer";
      return base({
        suggestion: "notify_waitlist_promoted",
        uiKind: paid ? "waitlist_promoted" : "unpaid_promote",
        title: paid ? "Waitlist promoted (paid)" : "Waitlist promoted — awaiting payment",
        body: paid
          ? `${role} seat unlocked and confirmed.`
          : `${role} seat unlocked — pay link emailed. Chase unpaid before class.`,
        severity: paid ? "info" : "warning",
        sessionId,
        enrollmentId,
        studentId,
        cta: paid ? "none" : "dismiss",
        autoApplied: true,
        requiresUserConfirmation: false,
        softOpenRole: null,
        capacity: null,
        draftOutreach: null,
      });
    }

    case "enrollment.unpaid_promote_chase":
      return base({
        suggestion: "chase_unpaid_promote",
        uiKind: "unpaid_promote",
        title: "Unpaid promoted seat",
        body: asString(log.payload.message) ??
          "Promoted student still unpaid — reminder sent. Prioritize on Accueil unpaid filter.",
        severity: "critical",
        sessionId,
        enrollmentId,
        studentId,
        cta: "dismiss",
        autoApplied: true,
        requiresUserConfirmation: false,
        softOpenRole: null,
        capacity: null,
        draftOutreach: null,
      });

    case "instructor.payroll_calculated":
      return base({
        suggestion: "review_instructor_payroll",
        uiKind: "info",
        title: "Instructor payroll ready",
        body: "Review payroll before export.",
        severity: "info",
        sessionId,
        enrollmentId: asString(log.payload.payrollLogId),
        studentId,
        cta: "dismiss",
        autoApplied: false,
        requiresUserConfirmation: true,
        softOpenRole: null,
        capacity: null,
        draftOutreach: null,
      });

    case "churn.risk_detected": {
      const name = asString(log.payload.fullName) ?? "Student";
      const courses = Array.isArray(log.payload.courseTitles)
        ? (log.payload.courseTitles as unknown[]).filter((x) => typeof x === "string").join(", ")
        : "";
      const draft =
        asString(log.payload.draftOutreach) ??
        `Hi ${name}, we missed you in class${courses ? ` (${courses})` : ""}. Want a quick catch-up session this week?`;
      return base({
        suggestion: "review_retention_outreach",
        uiKind: "churn_risk",
        title: `Churn risk: ${name}`,
        body: "Paid but missed attendance — confirm before sending outreach (no silent email).",
        severity: "warning",
        sessionId,
        enrollmentId,
        studentId,
        cta: "dismiss",
        autoApplied: false,
        requiresUserConfirmation: true,
        softOpenRole: null,
        capacity: null,
        draftOutreach: draft,
      });
    }

    default:
      return base({
        suggestion: "unhandled_dance_event",
        uiKind: "info",
        title: "Dance agent ack",
        body: `Unhandled event: ${log.event_type}`,
        severity: "info",
        sessionId,
        enrollmentId,
        studentId,
        cta: "none",
        autoApplied: false,
        requiresUserConfirmation: false,
        softOpenRole: null,
        capacity: null,
        draftOutreach: null,
      });
  }
}
