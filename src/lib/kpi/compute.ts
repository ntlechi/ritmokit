import "server-only";

import type { PosSalesChannel } from "@/generated/prisma/enums";
import {
  calculateLiveLaborKpis,
  getDayBoundsFromLocalDate,
  type LiveLaborKpiReport,
} from "@/lib/finance/labor-kpis";
import {
  KPI_LABOR_COST_GOOD_MAX,
  KPI_LABOR_COST_WARN_MAX,
  KPI_ORDER_ACCURACY_GOOD_MIN,
  KPI_ORDER_ACCURACY_WARN_MIN,
  KPI_PRIME_COST_GOOD_MAX,
  KPI_PRIME_COST_WARN_MAX,
  KPI_SOS_GOOD_MAX,
  KPI_SOS_WARN_MAX,
  KPI_SPLH_GOOD_MIN,
  KPI_SPLH_WARN_MIN,
  KPI_TURNOVER_GOOD_MAX,
  KPI_TURNOVER_WARN_MAX,
} from "@/lib/kpi/thresholds";
import type { KpiChannelBreakdown, KpiHealth, KpiMetric, LocationKpiSnapshot } from "@/lib/kpi/types";
import { prisma } from "@/lib/prisma";

const TURNOVER_WINDOW_DAYS = 90;
const SOS_WINDOW_DAYS = 7;
const CHANNEL_WINDOW_DAYS = 7;

function laborHealth(pct: number): KpiHealth {
  if (pct <= KPI_LABOR_COST_GOOD_MAX) return "good";
  if (pct <= KPI_LABOR_COST_WARN_MAX) return "warning";
  return "critical";
}

function splhHealth(value: number): KpiHealth {
  if (value >= KPI_SPLH_GOOD_MIN) return "good";
  if (value >= KPI_SPLH_WARN_MIN) return "warning";
  return "critical";
}

function turnoverHealth(rate: number): KpiHealth {
  if (rate <= KPI_TURNOVER_GOOD_MAX) return "good";
  if (rate <= KPI_TURNOVER_WARN_MAX) return "warning";
  return "critical";
}

function sosHealth(seconds: number): KpiHealth {
  if (seconds <= KPI_SOS_GOOD_MAX) return "good";
  if (seconds <= KPI_SOS_WARN_MAX) return "warning";
  return "critical";
}

function orderAccuracyHealth(pct: number): KpiHealth {
  if (pct >= KPI_ORDER_ACCURACY_GOOD_MIN) return "good";
  if (pct >= KPI_ORDER_ACCURACY_WARN_MIN) return "warning";
  return "critical";
}

function primeCostHealth(pct: number): KpiHealth {
  if (pct <= KPI_PRIME_COST_GOOD_MAX) return "good";
  if (pct <= KPI_PRIME_COST_WARN_MAX) return "warning";
  return "critical";
}

function channelKey(channel: PosSalesChannel): KpiChannelBreakdown["channel"] {
  return channel;
}

export async function computeLocationKpiSnapshot(
  locationId: string,
  targetDate = new Date(),
  /** Reuse an already-computed labor report to avoid a second full KPI pass. */
  laborReport?: LiveLaborKpiReport | null,
): Promise<LocationKpiSnapshot> {
  const labor =
    laborReport !== undefined
      ? laborReport
      : await calculateLiveLaborKpis({ locationId, targetDate }).catch(() => null);

  const windowStart = new Date(targetDate);
  windowStart.setDate(windowStart.getDate() - TURNOVER_WINDOW_DAYS);

  const channelWindowStart = new Date(targetDate);
  channelWindowStart.setDate(channelWindowStart.getDate() - CHANNEL_WINDOW_DAYS);

  const sosWindowStart = new Date(targetDate);
  sosWindowStart.setDate(sosWindowStart.getDate() - SOS_WINDOW_DAYS);

  const dayBounds = getDayBoundsFromLocalDate(targetDate);

  const [
    location,
    activeHeadcount,
    departures,
    hiresInWindow,
    channelRows,
    sosRows,
    orderErrors,
    totalOrdersToday,
    posIntegration,
  ] = await Promise.all([
    prisma.location.findUnique({
      where: { id: locationId },
      select: { foodCostPct: true },
    }),
    prisma.locationMember.count({ where: { locationId } }),
    prisma.staffDeparture.count({
      where: { locationId, departedAt: { gte: windowStart } },
    }),
    prisma.locationMember.count({
      where: { locationId, hiredAt: { gte: windowStart } },
    }),
    prisma.posChannelSalesDaily.findMany({
      where: { locationId, date: { gte: channelWindowStart } },
    }),
    prisma.posIngestionLog.findMany({
      where: {
        locationId,
        status: "PROCESSED",
        paidAt: { not: null },
        readyAt: { not: null },
        processedAt: { gte: sosWindowStart },
      },
      select: { paidAt: true, readyAt: true },
    }),
    prisma.disciplinaryRecord.count({
      where: {
        locationId,
        infractionCode: "RUSH_FOCUS",
        occurredAt: { gte: channelWindowStart },
      },
    }),
    prisma.posIngestionLog.count({
      where: {
        locationId,
        status: "PROCESSED",
        processedAt: { gte: dayBounds.dayStart, lt: dayBounds.dayEnd },
      },
    }),
    prisma.posIntegration.findUnique({
      where: { locationId },
      select: { isActive: true },
    }),
  ]);

  const hasPosLive = Boolean(posIntegration?.isActive);

  const metrics: KpiMetric[] = [];

  // 1. Labor Cost %
  const laborPct = labor?.hasSalesData ? labor.liveLaborCostPercentage : null;
  metrics.push({
    key: "LABOR_COST_PCT",
    value: laborPct,
    unit: "percent",
    health: laborPct != null ? laborHealth(laborPct) : "neutral",
    availability: labor?.hasPosData ? "live" : labor?.hasSalesData ? "partial" : "pending",
    targetMin: 25,
    targetMax: 32,
  });

  // 2. SPLH
  const splh = labor?.dailySplh && labor.dailySplh > 0 ? labor.dailySplh : null;
  metrics.push({
    key: "SPLH",
    value: splh,
    unit: "currency",
    health: splh != null ? splhHealth(splh) : "neutral",
    availability: labor?.hasSalesData ? (labor.hasPosData ? "live" : "partial") : "pending",
    targetMin: KPI_SPLH_GOOD_MIN,
  });

  // 3. Staff turnover (90-day annualized proxy)
  const avgHeadcount = Math.max(1, activeHeadcount);
  const turnoverRate =
    departures > 0 ? Math.round(((departures / avgHeadcount) * (365 / TURNOVER_WINDOW_DAYS)) * 10) / 10 : 0;
  metrics.push({
    key: "STAFF_TURNOVER_RATE",
    value: activeHeadcount > 0 ? turnoverRate : null,
    unit: "percent",
    health: turnoverRate != null ? turnoverHealth(turnoverRate) : "neutral",
    availability: departures > 0 || hiresInWindow > 0 ? "live" : "partial",
    targetMax: KPI_TURNOVER_GOOD_MAX,
    sampleSize: departures,
  });

  // 4. Speed of Service
  const sosSamples = sosRows
    .map((row) => {
      if (!row.paidAt || !row.readyAt) return null;
      return (row.readyAt.getTime() - row.paidAt.getTime()) / 1000;
    })
    .filter((s): s is number => s != null && s > 0 && s < 3600);
  const avgSos =
    sosSamples.length > 0
      ? Math.round(sosSamples.reduce((a, b) => a + b, 0) / sosSamples.length)
      : null;
  metrics.push({
    key: "SPEED_OF_SERVICE",
    value: avgSos,
    unit: "seconds",
    health: avgSos != null ? sosHealth(avgSos) : "neutral",
    availability: avgSos != null ? "live" : "pending",
    targetMax: KPI_SOS_GOOD_MAX,
    sampleSize: sosSamples.length,
  });

  // 5. Order accuracy — partial via RUSH_FOCUS infractions vs orders (Convention proxy)
  const channelOrderTotal = channelRows.reduce((s, r) => s + r.orderCount, 0);
  const orderDenominator = Math.max(channelOrderTotal, totalOrdersToday);
  const accuracyPct =
    orderDenominator > 0
      ? Math.round(((orderDenominator - orderErrors) / orderDenominator) * 1000) / 10
      : null;
  metrics.push({
    key: "ORDER_ACCURACY_PCT",
    value: accuracyPct,
    unit: "percent",
    health: accuracyPct != null ? orderAccuracyHealth(accuracyPct) : "neutral",
    availability: orderDenominator > 0 ? "partial" : "pending",
    targetMin: KPI_ORDER_ACCURACY_GOOD_MIN,
    sampleSize: orderDenominator,
  });

  // 6. Prime Cost %
  const foodCostPct = location?.foodCostPct != null ? Number(location.foodCostPct) : null;
  const primeCostPct =
    foodCostPct != null && laborPct != null ? Math.round((foodCostPct + laborPct) * 10) / 10 : null;
  metrics.push({
    key: "PRIME_COST_PCT",
    value: primeCostPct,
    unit: "percent",
    health: primeCostPct != null ? primeCostHealth(primeCostPct) : "neutral",
    availability: primeCostPct != null ? "live" : foodCostPct == null ? "pending" : "partial",
    targetMax: KPI_PRIME_COST_GOOD_MAX,
  });

  // 7. Average ticket size (7-day, by channel)
  const channelBreakdown: KpiChannelBreakdown[] = Array.from(
    channelRows
      .reduce(
        (map, row) => {
          const key = channelKey(row.channel);
          const prev = map.get(key) ?? { channel: key, netSales: 0, orderCount: 0 };
          prev.netSales += Number(row.netSales);
          prev.orderCount += row.orderCount;
          map.set(key, prev);
          return map;
        },
        new Map<
          KpiChannelBreakdown["channel"],
          { channel: KpiChannelBreakdown["channel"]; netSales: number; orderCount: number }
        >(),
      )
      .values(),
  )
    .map((row) => ({
      channel: row.channel,
      avgTicket: row.orderCount > 0 ? Math.round((row.netSales / row.orderCount) * 100) / 100 : 0,
      orderCount: row.orderCount,
    }))
    .filter((row) => row.orderCount > 0);

  const totalChannelSales = channelBreakdown.reduce((s, c) => s + c.avgTicket * c.orderCount, 0);
  const totalChannelOrders = channelBreakdown.reduce((s, c) => s + c.orderCount, 0);
  const avgTicket =
    totalChannelOrders > 0 ? Math.round((totalChannelSales / totalChannelOrders) * 100) / 100 : null;

  metrics.push({
    key: "AVG_TICKET_SIZE",
    value: avgTicket,
    unit: "currency",
    health: "neutral",
    availability: totalChannelOrders > 0 ? (channelBreakdown.length > 1 ? "live" : "partial") : "pending",
    channelBreakdown,
    sampleSize: totalChannelOrders,
  });

  // 8. Repeat visitor rate — requires UEAT customer identity
  metrics.push({
    key: "REPEAT_VISITOR_RATE",
    value: null,
    unit: "percent",
    health: "neutral",
    availability: "pending",
    targetMin: 40,
  });

  return {
    metrics,
    computedAt: targetDate.toISOString(),
    hasPosLive,
  };
}
