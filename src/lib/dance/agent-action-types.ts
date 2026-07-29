export type DanceAgentUiKind =
  | "parity_imbalance"
  | "waitlist_promoted"
  | "unpaid_promote"
  | "churn_risk"
  | "info";

export type DanceAgentCta = "confirm_soft_open" | "dismiss" | "none";

export type DanceAgentSeverity = "info" | "warning" | "critical";

/** Shape stored on `agent_logs.result` after dance handler runs. */
export type DanceAgentResult = {
  acknowledged: boolean;
  suggestion: string;
  uiKind: DanceAgentUiKind;
  title: string;
  body: string;
  severity: DanceAgentSeverity;
  sessionId: string | null;
  enrollmentId?: string | null;
  studentId?: string | null;
  cta: DanceAgentCta;
  autoApplied: boolean;
  requiresUserConfirmation: boolean;
  softOpenRole?: "LEAD" | "FOLLOW" | null;
  capacity?: {
    filledLeads: number;
    filledFollows: number;
    maxLeads: number;
    maxFollows: number;
  } | null;
  draftOutreach?: string | null;
  resolved?: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolveAction?: "confirmed" | "dismissed" | null;
};

export type DanceAgentAction = {
  id: string;
  eventType: string;
  createdAt: string;
  uiKind: DanceAgentUiKind;
  title: string;
  body: string;
  severity: DanceAgentSeverity;
  sessionId: string | null;
  enrollmentId: string | null;
  cta: DanceAgentCta;
  softOpenRole: "LEAD" | "FOLLOW" | null;
  requiresUserConfirmation: boolean;
  autoApplied: boolean;
};
