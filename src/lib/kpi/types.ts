/** Canonical dance KPI keys — stored in OperationalGoal.metricKey and Autopilot loops. */
export type DanceKpiKey =
  // Operations
  | "FLOOR_UTILIZATION_PCT"
  | "YIELD_PER_SQM"
  | "INSTRUCTOR_SUB_RATE"
  // Parity
  | "LEAD_FOLLOW_DELTA"
  | "BLOCKED_REVENUE"
  | "SOLO_COUPLE_RATIO"
  // Financial
  | "NET_PROFIT_PER_CLASS"
  | "PAYROLL_TO_REVENUE_PCT"
  | "SEASON_VS_DROPIN_MIX"
  // Retention
  | "L1_TO_L2_PROGRESSION"
  | "CHURN_RISK_COUNT"
  | "STYLE_CROSSOVER_PCT"
  | "SOCIAL_CONVERSION_PCT";

/** @deprecated Use DanceKpiKey — alias kept for gradual migration. */
export type KpiKey = DanceKpiKey;

export type KpiAvailability = "live" | "partial" | "pending";

export type KpiHealth = "good" | "warning" | "critical" | "neutral";

export type KpiUnit = "percent" | "currency" | "seconds" | "ratio" | "count";

export type KpiChannelBreakdown = {
  channel: "IN_STORE" | "UEAT" | "DOORDASH" | "OTHER";
  avgTicket: number;
  orderCount: number;
};

export type KpiMetric = {
  key: DanceKpiKey;
  value: number | null;
  unit: KpiUnit;
  health: KpiHealth;
  availability: KpiAvailability;
  /** Target band or single target for gauge coloring. */
  targetMin?: number;
  targetMax?: number;
  /** Legacy channel breakdown — unused for dance KPIs. */
  channelBreakdown?: KpiChannelBreakdown[];
  /** Sample size (classes, students) for trust indicator. */
  sampleSize?: number;
};

export type LocationKpiSnapshot = {
  metrics: KpiMetric[];
  computedAt: string;
  /** True when enrollment/class data is available for live dance KPIs. */
  hasLiveData: boolean;
  /** @deprecated Prefer hasLiveData. */
  hasPosLive: boolean;
};

export const DANCE_KPI_KEYS: DanceKpiKey[] = [
  "FLOOR_UTILIZATION_PCT",
  "YIELD_PER_SQM",
  "LEAD_FOLLOW_DELTA",
  "BLOCKED_REVENUE",
  "NET_PROFIT_PER_CLASS",
  "PAYROLL_TO_REVENUE_PCT",
  "L1_TO_L2_PROGRESSION",
  "CHURN_RISK_COUNT",
];

/** @deprecated Use DANCE_KPI_KEYS. */
export const KPI_KEYS = DANCE_KPI_KEYS;
