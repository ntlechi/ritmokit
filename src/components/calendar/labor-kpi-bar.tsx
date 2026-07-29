import { AlertTriangle, Clock3, DollarSign, Gauge, TrendingUp } from "lucide-react";
import { dna } from "@/lib/design/dna";
import {
  LABOR_COST_TARGET_MAX,
  LABOR_COST_TARGET_MIN,
  type LaborCostStatus,
  type LiveLaborKpiReport,
} from "@/lib/finance/labor-kpis";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function statusTone(status: LaborCostStatus): "success" | "warning" | "danger" {
  if (status === "critical") return "danger";
  if (status === "warning") return "warning";
  return "success";
}

function statusLabel(dict: Dictionary, status: LaborCostStatus) {
  if (status === "critical") return dict.laborKpi.statusCritical;
  if (status === "warning") return dict.laborKpi.statusWarning;
  return dict.laborKpi.statusGood;
}

function statusRingColor(status: LaborCostStatus) {
  if (status === "critical") return "bg-danger";
  if (status === "warning") return "bg-warning";
  return "bg-success";
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(
    amount,
  );
}

function LaborCostGauge({ dict, report }: { dict: Dictionary; report: LiveLaborKpiReport }) {
  const status = report.liveLaborCostStatus;
  const gaugePct = Math.min(report.liveLaborCostPercentage, 60);

  return (
    <div className={cn("flex min-w-[220px] flex-1 flex-col gap-2 p-4", dna.panel)}>
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
          <DollarSign className="h-3.5 w-3.5" aria-hidden />
          {dict.laborKpi.liveLaborCost}
        </div>
        <Badge tone={statusTone(status)}>{statusLabel(dict, status)}</Badge>
      </div>

      <p className="metric text-3xl font-semibold">
        {report.hasClassRevenueData ? `${report.liveLaborCostPercentage}%` : "—"}
      </p>

      {report.hasClassRevenueData ? (
        <>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full transition-all", statusRingColor(status))}
              style={{ width: `${(gaugePct / 60) * 100}%` }}
            />
            <div
              className="absolute inset-y-0 w-px bg-foreground/30"
              style={{ left: `${(LABOR_COST_TARGET_MIN / 60) * 100}%` }}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 w-px bg-foreground/30"
              style={{ left: `${(LABOR_COST_TARGET_MAX / 60) * 100}%` }}
              aria-hidden
            />
          </div>
          <p className="text-xs text-foreground-muted">
            {dict.laborKpi.target} · {dict.laborKpi.fullDayLaborCost}: {report.fullDayLaborCostPercentage}%
          </p>
        </>
      ) : (
        <p className="text-xs text-foreground-muted">{dict.laborKpi.noClassRevenueData}</p>
      )}
    </div>
  );
}

function RevenuePerHourCard({ dict, report }: { dict: Dictionary; report: LiveLaborKpiReport }) {
  return (
    <div className={cn("flex min-w-[180px] flex-1 flex-col gap-2 p-4", dna.panel)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        {dict.laborKpi.revenuePerHour}
      </div>
      <p className="metric text-3xl font-semibold">
        {report.currentHourRevenuePerLaborHour !== null ? formatCurrency(report.currentHourRevenuePerLaborHour) : "—"}
      </p>
      <p className="text-xs text-foreground-muted">
        {report.isToday ? dict.laborKpi.revenuePerHourCurrent : dict.laborKpi.revenuePerHourDaily} ·{" "}
        {dict.laborKpi.revenuePerHourDaily}: {formatCurrency(report.dailyRevenuePerLaborHour)}
      </p>
    </div>
  );
}

function OvertimeRiskCard({ dict, report }: { dict: Dictionary; report: LiveLaborKpiReport }) {
  return (
    <div className={cn("flex min-w-[220px] flex-1 flex-col gap-2 p-4", dna.panel)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        {dict.laborKpi.overtimeRisk}
      </div>

      {report.overtimeRisk.length === 0 ? (
        <p className="text-sm text-foreground-muted">{dict.laborKpi.overtimeRiskEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {report.overtimeRisk.slice(0, 3).map((row) => (
            <li key={row.userId} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{row.fullName}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs tabular-nums text-foreground-muted">
                  {row.weeklyHours}
                  {dict.laborKpi.weeklyHoursOf} {row.maxHoursPerWeek}h
                </span>
                <Badge tone={row.riskLevel === "HIGH" ? "danger" : "warning"}>
                  {row.riskLevel === "HIGH" ? dict.laborKpi.riskHigh : dict.laborKpi.riskMedium}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LaborVarianceCard({ dict, report }: { dict: Dictionary; report: LiveLaborKpiReport }) {
  const { laborVariance } = report;
  const total = laborVariance.totalVarianceHours;

  return (
    <div className={cn("flex min-w-[200px] flex-1 flex-col gap-2 p-4", dna.panel)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        <Clock3 className="h-3.5 w-3.5" aria-hidden />
        {dict.laborKpi.laborVariance}
      </div>

      {!laborVariance.hasPunchData || total === null ? (
        <p className="text-sm text-foreground-muted">{dict.laborKpi.laborVarianceEmpty}</p>
      ) : (
        <>
          <p
            className={cn(
              "metric text-3xl font-semibold",
              total > 0 ? "text-success" : total < 0 ? "text-danger" : "text-foreground",
            )}
          >
            {total > 0 ? "+" : ""}
            {total}h
          </p>
          <p className="text-xs text-foreground-muted">
            {total > 0
              ? dict.laborKpi.varianceAhead
              : total < 0
                ? dict.laborKpi.varianceBehind
                : dict.laborKpi.varianceOnTime}
          </p>
        </>
      )}
    </div>
  );
}

export function LaborKpiBar({ dict, report }: { dict: Dictionary; report: LiveLaborKpiReport }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
        <Gauge className="h-3.5 w-3.5" aria-hidden />
        {dict.laborKpi.title} · {dict.laborKpi.managerOnly}
      </div>
      <div className="flex flex-wrap gap-3">
        <LaborCostGauge dict={dict} report={report} />
        <RevenuePerHourCard dict={dict} report={report} />
        <OvertimeRiskCard dict={dict} report={report} />
        <LaborVarianceCard dict={dict} report={report} />
      </div>
    </section>
  );
}
