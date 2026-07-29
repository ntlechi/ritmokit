import type { ManagerOpsDashboard } from "@/lib/data/manager-ops-dashboard";

export type LaborRevenueChartCopy = {
  efficiencyTitle: string;
  efficiencySubtitle: string;
  laborSeries: string;
  salesSeries: string;
  peakZone: string;
};

export function LaborRevenueChart({
  data,
  copy,
}: {
  data: NonNullable<ManagerOpsDashboard["labor"]>;
  copy: LaborRevenueChartCopy;
}) {
  const buckets = data.buckets.filter((b) => b.hour >= 6 && b.hour <= 23);
  const width = 720;
  const height = 260;
  const pad = { top: 24, right: 24, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const sales = buckets.map((b) => b.actualClassRevenue ?? b.projectedClassRevenue);
  const labor = buckets.map((b) => b.laborCost);
  const maxSales = Math.max(...sales, 1);
  const maxLabor = Math.max(...labor, 1);

  const x = (i: number) => pad.left + (i / Math.max(buckets.length - 1, 1)) * innerW;
  const ySales = (v: number) => pad.top + innerH - (v / maxSales) * innerH;
  const yLabor = (v: number) => pad.top + innerH - (v / maxLabor) * innerH;

  const salesPath = sales
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${ySales(v)}`)
    .join(" ");
  const laborPath = labor
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${yLabor(v)}`)
    .join(" ");

  const dangerZones = buckets
    .map((b, i) => {
      const salesVal = sales[i] || 1;
      const ratio = (labor[i] / salesVal) * 100;
      const isPeak = (b.hour >= 11 && b.hour <= 14) || (b.hour >= 17 && b.hour <= 20);
      if (!isPeak) return null;
      return { i, over: ratio > 32, under: ratio < 18 && salesVal > 80 };
    })
    .filter(Boolean) as Array<{ i: number; over: boolean; under: boolean }>;

  const laborArea = `${laborPath} L ${x(labor.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`;
  const salesArea = `${salesPath} L ${x(sales.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`;

  return (
    <div className="premium-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display-title text-lg font-semibold tracking-tight">{copy.efficiencyTitle}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{copy.efficiencySubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-foreground-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {copy.laborSeries}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            {copy.salesSeries}
          </span>
          <span className="inline-flex items-center gap-1.5 text-red-600/80 dark:text-red-300/80">
            <span className="h-2 w-2 rounded-full bg-red-500/40" />
            {copy.peakZone}
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[560px] w-full"
          role="img"
          aria-label={copy.efficiencyTitle}
        >
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#18181b" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#18181b" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="laborFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={pad.left}
              x2={width - pad.right}
              y1={pad.top + innerH * (1 - t)}
              y2={pad.top + innerH * (1 - t)}
              stroke="var(--border)"
              strokeOpacity="0.9"
            />
          ))}

          {dangerZones.map(({ i, over, under }) => (
            <rect
              key={i}
              x={x(i) - innerW / buckets.length / 2}
              y={pad.top}
              width={innerW / buckets.length}
              height={innerH}
              fill={
                over || under
                  ? "color-mix(in srgb, #ef4444 10%, transparent)"
                  : "transparent"
              }
            />
          ))}

          <path d={salesArea} fill="url(#salesFill)" />
          <path d={laborArea} fill="url(#laborFill)" />
          <path d={salesPath} fill="none" stroke="var(--foreground)" strokeWidth="2.25" strokeLinecap="round" />
          <path d={laborPath} fill="none" stroke="#ef4444" strokeWidth="2.25" strokeLinecap="round" />

          {buckets.map((b, i) =>
            i % 2 === 0 ? (
              <text
                key={b.hour}
                x={x(i)}
                y={height - 12}
                textAnchor="middle"
                className="fill-foreground-muted font-mono text-[10px]"
              >
                {`${b.hour}h`}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}
