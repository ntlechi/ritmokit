import "server-only";

import { loadDanceAnalyticsForLocation } from "@/lib/dance/analytics";
import {
  KPI_FLOOR_UTIL_GOOD_MIN,
  KPI_FLOOR_UTIL_WARN_MIN,
  KPI_L1_L2_GOOD_MIN,
  KPI_L1_L2_WARN_MIN,
  KPI_NET_PROFIT_GOOD_MIN,
  KPI_NET_PROFIT_WARN_MIN,
  KPI_PARITY_DELTA_WARN_MAX,
  KPI_PAYROLL_REV_GOOD_MAX,
  KPI_PAYROLL_REV_WARN_MAX,
  KPI_YIELD_SQM_GOOD_MIN,
  KPI_YIELD_SQM_WARN_MIN,
} from "@/lib/kpi/thresholds";
import type { KpiHealth, KpiMetric, LocationKpiSnapshot } from "@/lib/kpi/types";

function utilHealth(pct: number): KpiHealth {
  if (pct >= KPI_FLOOR_UTIL_GOOD_MIN) return "good";
  if (pct >= KPI_FLOOR_UTIL_WARN_MIN) return "warning";
  return "critical";
}

function yieldHealth(value: number): KpiHealth {
  if (value >= KPI_YIELD_SQM_GOOD_MIN) return "good";
  if (value >= KPI_YIELD_SQM_WARN_MIN) return "warning";
  return "critical";
}

function parityHealth(delta: number): KpiHealth {
  if (delta <= 0) return "good";
  if (delta <= KPI_PARITY_DELTA_WARN_MAX) return "warning";
  return "critical";
}

function payrollHealth(pct: number): KpiHealth {
  if (pct <= KPI_PAYROLL_REV_GOOD_MAX) return "good";
  if (pct <= KPI_PAYROLL_REV_WARN_MAX) return "warning";
  return "critical";
}

function progressionHealth(pct: number): KpiHealth {
  if (pct >= KPI_L1_L2_GOOD_MIN) return "good";
  if (pct >= KPI_L1_L2_WARN_MIN) return "warning";
  return "critical";
}

function profitHealth(value: number): KpiHealth {
  if (value >= KPI_NET_PROFIT_GOOD_MIN) return "good";
  if (value >= KPI_NET_PROFIT_WARN_MIN) return "warning";
  return "critical";
}

/**
 * Dance-native location KPI snapshot for the studio cockpit.
 * Replaces QSR labor/SPLH/POS metrics.
 */
export async function computeLocationKpiSnapshot(
  locationId: string,
  targetDate = new Date(),
): Promise<LocationKpiSnapshot> {
  const analytics = await loadDanceAnalyticsForLocation(locationId).catch(() => null);
  const a = analytics?.aggregates;
  const hasLiveData = Boolean(a && a.classCount > 0);
  const availability = hasLiveData ? "live" : "pending";

  const metrics: KpiMetric[] = [
    {
      key: "FLOOR_UTILIZATION_PCT",
      value: a?.floorUtilizationPct ?? null,
      unit: "percent",
      health: a?.floorUtilizationPct != null ? utilHealth(a.floorUtilizationPct) : "neutral",
      availability,
      targetMin: KPI_FLOOR_UTIL_GOOD_MIN,
      sampleSize: a?.classCount,
    },
    {
      key: "YIELD_PER_SQM",
      value: a?.avgYieldPerSqm ?? null,
      unit: "currency",
      health: a?.avgYieldPerSqm != null ? yieldHealth(a.avgYieldPerSqm) : "neutral",
      availability: a?.avgYieldPerSqm != null ? "live" : "pending",
      targetMin: KPI_YIELD_SQM_GOOD_MIN,
      sampleSize: a?.classCount,
    },
    {
      key: "LEAD_FOLLOW_DELTA",
      value: a?.avgLeadFollowDelta ?? null,
      unit: "ratio",
      health: a?.avgLeadFollowDelta != null ? parityHealth(a.avgLeadFollowDelta) : "neutral",
      availability,
      targetMax: KPI_PARITY_DELTA_WARN_MAX,
      sampleSize: a?.classCount,
    },
    {
      key: "BLOCKED_REVENUE",
      value: a?.blockedRevenue ?? null,
      unit: "currency",
      health:
        a?.blockedRevenue == null
          ? "neutral"
          : a.blockedRevenue <= 0
            ? "good"
            : a.blockedRevenue < 200
              ? "warning"
              : "critical",
      availability,
      sampleSize: a?.classCount,
    },
    {
      key: "NET_PROFIT_PER_CLASS",
      value: a?.avgNetProfitPerClass ?? null,
      unit: "currency",
      health:
        a?.avgNetProfitPerClass != null ? profitHealth(a.avgNetProfitPerClass) : "neutral",
      availability,
      targetMin: KPI_NET_PROFIT_GOOD_MIN,
      sampleSize: a?.classCount,
    },
    {
      key: "PAYROLL_TO_REVENUE_PCT",
      value: a?.payrollToRevenuePct ?? null,
      unit: "percent",
      health:
        a?.payrollToRevenuePct != null ? payrollHealth(a.payrollToRevenuePct) : "neutral",
      availability: a?.payrollToRevenuePct != null ? "live" : "pending",
      targetMax: KPI_PAYROLL_REV_GOOD_MAX,
      sampleSize: a?.paidEnrollmentCount,
    },
    {
      key: "L1_TO_L2_PROGRESSION",
      value: analytics?.progression.l1ToL2Rate ?? null,
      unit: "percent",
      health:
        analytics?.progression.l1ToL2Rate != null
          ? progressionHealth(analytics.progression.l1ToL2Rate)
          : "neutral",
      availability:
        analytics?.progression.beginnerCompleters && analytics.progression.beginnerCompleters > 0
          ? "partial"
          : "pending",
      targetMin: KPI_L1_L2_GOOD_MIN,
      sampleSize: analytics?.progression.beginnerCompleters,
    },
    {
      key: "CHURN_RISK_COUNT",
      value: a?.churnRiskCount ?? null,
      unit: "count",
      health:
        a?.churnRiskCount == null
          ? "neutral"
          : a.churnRiskCount === 0
            ? "good"
            : a.churnRiskCount < 5
              ? "warning"
              : "critical",
      availability: hasLiveData ? "partial" : "pending",
      sampleSize: a?.paidEnrollmentCount,
    },
  ];

  return {
    metrics,
    computedAt: targetDate.toISOString(),
    hasLiveData,
    hasPosLive: hasLiveData,
  };
}
