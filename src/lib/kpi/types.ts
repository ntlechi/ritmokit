/** Canonical KPI keys — stored in OperationalGoal.metricKey and Autopilot loops. */
export type KpiKey =
  | "LABOR_COST_PCT"
  | "SPLH"
  | "STAFF_TURNOVER_RATE"
  | "SPEED_OF_SERVICE"
  | "ORDER_ACCURACY_PCT"
  | "PRIME_COST_PCT"
  | "AVG_TICKET_SIZE"
  | "REPEAT_VISITOR_RATE";

export type KpiAvailability = "live" | "partial" | "pending";

export type KpiHealth = "good" | "warning" | "critical" | "neutral";

export type KpiUnit = "percent" | "currency" | "seconds" | "ratio";

export type KpiChannelBreakdown = {
  channel: "IN_STORE" | "UEAT" | "DOORDASH" | "OTHER";
  avgTicket: number;
  orderCount: number;
};

export type KpiMetric = {
  key: KpiKey;
  value: number | null;
  unit: KpiUnit;
  health: KpiHealth;
  availability: KpiAvailability;
  /** Target band or single target for gauge coloring. */
  targetMin?: number;
  targetMax?: number;
  /** Channel-level avg ticket when applicable. */
  channelBreakdown?: KpiChannelBreakdown[];
  /** Sample size (orders, employees, responses) for trust indicator. */
  sampleSize?: number;
};

export type LocationKpiSnapshot = {
  metrics: KpiMetric[];
  computedAt: string;
  hasPosLive: boolean;
};

export const KPI_KEYS: KpiKey[] = [
  "LABOR_COST_PCT",
  "SPLH",
  "STAFF_TURNOVER_RATE",
  "SPEED_OF_SERVICE",
  "ORDER_ACCURACY_PCT",
  "PRIME_COST_PCT",
  "AVG_TICKET_SIZE",
  "REPEAT_VISITOR_RATE",
];
