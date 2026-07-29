/**
 * Minimal SVG chart primitives — no chart library, no client JS.
 *
 * Every primitive is a pure server component that paints with theme tokens
 * (`--success`, `--warning`, `--danger`, `--accent`) so light/dark both work.
 * Shapes carry an accessible label; colour is never the only signal.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ChartTone = "accent" | "success" | "warning" | "danger" | "muted";

const STROKE: Record<ChartTone, string> = {
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  muted: "var(--foreground-muted)",
};

export function toneColor(tone: ChartTone): string {
  return STROKE[tone];
}

/**
 * Categorical series colours. `--accent` is near-black in light mode, so a
 * multi-category chart needs its own hues to stay readable.
 */
export const CHART_PALETTE = [
  "#0EA5E9",
  "#8B5CF6",
  "#F59E0B",
  "#10B981",
  "#F43F5E",
  "#6366F1",
] as const;

export function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

/** Health tone from a value against good/warn thresholds (higher is better). */
export function toneForHigher(value: number, good: number, warn: number): ChartTone {
  if (value >= good) return "success";
  if (value >= warn) return "warning";
  return "danger";
}

/** Health tone where a lower value is better (deltas, cost ratios). */
export function toneForLower(value: number, good: number, warn: number): ChartTone {
  if (value <= good) return "success";
  if (value <= warn) return "warning";
  return "danger";
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/* ── Progress ring — compact gauge for a single percentage ────────────────── */

export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 6,
  tone = "accent",
  label,
  caption,
  className,
}: {
  /** 0–100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: ChartTone;
  /** Text drawn in the middle; defaults to the rounded percentage. */
  label?: string;
  /** Accessible description of what the ring measures. */
  caption: string;
  className?: string;
}) {
  const pct = clampPct(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${caption}: ${Math.round(pct)}%`}
      className={cn("shrink-0", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={STROKE[tone]}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize={size * 0.26}
        fontWeight={600}
      >
        {label ?? `${Math.round(pct)}`}
      </text>
    </svg>
  );
}

/* ── Sparkline — trend at a glance ────────────────────────────────────────── */

export function Sparkline({
  values,
  width = 96,
  height = 28,
  tone = "accent",
  filled = true,
  caption,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: ChartTone;
  filled?: boolean;
  caption: string;
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label={caption} className={className}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--border)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 2;
  const usable = height - pad * 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = pad + usable - ((v - min) / span) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const last = values[values.length - 1];
  const lastY = pad + usable - ((last - min) / span) * usable;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={caption}
      className={cn("overflow-visible", className)}
    >
      {filled && (
        <polygon
          points={`0,${height} ${points.join(" ")} ${width},${height}`}
          fill={STROKE[tone]}
          opacity={0.12}
        />
      )}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={STROKE[tone]}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width} cy={lastY} r={2.5} fill={STROKE[tone]} />
    </svg>
  );
}

/* ── Diverging bar — two opposing roles around a centre axis ──────────────── */

export function DivergingBar({
  leftValue,
  rightValue,
  leftMax,
  rightMax,
  leftLabel,
  rightLabel,
  leftTone = "accent",
  rightTone = "warning",
  leftColor,
  rightColor,
  className,
}: {
  leftValue: number;
  rightValue: number;
  leftMax: number;
  rightMax: number;
  leftLabel: string;
  rightLabel: string;
  leftTone?: ChartTone;
  rightTone?: ChartTone;
  /** Explicit colours win over tones — used for the Lead/Follow sky/rose pair. */
  leftColor?: string;
  rightColor?: string;
  className?: string;
}) {
  const leftPct = leftMax > 0 ? clampPct((leftValue / leftMax) * 100) : 0;
  const rightPct = rightMax > 0 ? clampPct((rightValue / rightMax) * 100) : 0;

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="img"
      aria-label={`${leftLabel} ${leftValue}/${leftMax}, ${rightLabel} ${rightValue}/${rightMax}`}
    >
      <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground-muted">
        {leftValue}
      </span>
      <div className="flex h-2.5 flex-1 items-center gap-px">
        <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-surface-muted">
          <div
            className="h-full rounded-l-full transition-[width]"
            style={{ width: `${leftPct}%`, backgroundColor: leftColor ?? STROKE[leftTone] }}
          />
        </div>
        <div className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
        <div className="h-full flex-1 overflow-hidden rounded-r-full bg-surface-muted">
          <div
            className="h-full rounded-r-full transition-[width]"
            style={{ width: `${rightPct}%`, backgroundColor: rightColor ?? STROKE[rightTone] }}
          />
        </div>
      </div>
      <span className="w-10 shrink-0 text-[11px] font-medium tabular-nums text-foreground-muted">
        {rightValue}
      </span>
    </div>
  );
}

/* ── Meter — labelled horizontal bar with an optional target marker ───────── */

export function Meter({
  value,
  max = 100,
  tone = "accent",
  target,
  caption,
  className,
}: {
  value: number;
  max?: number;
  tone?: ChartTone;
  /** Draws a tick at this value on the track. */
  target?: number;
  caption: string;
  className?: string;
}) {
  const pct = max > 0 ? clampPct((value / max) * 100) : 0;
  const targetPct = target != null && max > 0 ? clampPct((target / max) * 100) : null;

  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}
      role="img"
      aria-label={caption}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: STROKE[tone] }}
      />
      {targetPct != null && (
        <span
          className="absolute top-0 h-full w-0.5 bg-foreground/40"
          style={{ left: `${targetPct}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}

/* ── Mini bar series — compact distribution ───────────────────────────────── */

export function MiniBars({
  bars,
  height = 40,
  maxBarWidth = 36,
  showValues = false,
  formatValue,
  caption,
  className,
}: {
  bars: Array<{ label: string; value: number; tone?: ChartTone; color?: string }>;
  height?: number;
  /** Caps bar width so a few bars in a wide card don't become slabs. */
  maxBarWidth?: number;
  /** Prints each value above its bar — worth it when there are ≤ 8 bars. */
  showValues?: boolean;
  formatValue?: (value: number) => string;
  caption: string;
  className?: string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  const trackHeight = height;

  return (
    <div className={cn("flex items-end gap-1.5", className)} role="img" aria-label={caption}>
      {bars.map((bar) => {
        const fill = Math.max(bar.value > 0 ? 3 : 0, (bar.value / max) * trackHeight);
        return (
          <div
            key={bar.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${bar.label}: ${bar.value}`}
          >
            {showValues && (
              <span className="text-[10px] leading-none tabular-nums text-foreground-muted">
                {bar.value > 0 ? (formatValue ? formatValue(bar.value) : bar.value) : ""}
              </span>
            )}
            <div
              className="flex w-full items-end overflow-hidden rounded-md bg-surface-muted"
              style={{ height: trackHeight, maxWidth: maxBarWidth }}
            >
              <div
                className="w-full rounded-md"
                style={{
                  height: `${fill}px`,
                  backgroundColor: bar.color ?? STROKE[bar.tone ?? "accent"],
                }}
              />
            </div>
            <span className="max-w-full truncate text-[10px] leading-none text-foreground-muted">
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Donut — proportional split with a centre readout ─────────────────────── */

export function Donut({
  segments,
  size = 88,
  thickness = 12,
  centerValue,
  centerLabel,
  caption,
  className,
}: {
  segments: Array<{ label: string; value: number; tone?: ChartTone; color?: string }>;
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  caption: string;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={caption}
      className={cn("shrink-0", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={thickness}
      />
      {total > 0 &&
        segments.map((segment) => {
          const fraction = segment.value / total;
          const dash = fraction * circumference;
          const element = (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color ?? STROKE[segment.tone ?? "accent"]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return element;
        })}
      {centerValue && (
        <text
          x="50%"
          y={centerLabel ? "45%" : "50%"}
          dominantBaseline="central"
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize={size * 0.22}
          fontWeight={600}
        >
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text
          x="50%"
          y="62%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="var(--foreground-muted)"
          fontSize={size * 0.11}
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

/* ── Funnel — stage-to-stage retention ────────────────────────────────────── */

export function Funnel({
  stages,
  width = 320,
  height = 128,
  caption,
  className,
}: {
  stages: Array<{ label: string; value: number; tone?: ChartTone }>;
  width?: number;
  height?: number;
  caption: string;
  className?: string;
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const bandHeight = height / stages.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={caption}
      className={cn("h-auto w-full", className)}
      preserveAspectRatio="none"
    >
      {stages.map((stage, i) => {
        const topRatio = stage.value / max;
        const nextValue = stages[i + 1]?.value ?? stage.value;
        const bottomRatio = nextValue / max;
        const y = i * bandHeight;
        const topHalf = (topRatio * width) / 2;
        const bottomHalf = (bottomRatio * width) / 2;
        const cx = width / 2;

        return (
          <polygon
            key={stage.label}
            points={[
              `${cx - topHalf},${y}`,
              `${cx + topHalf},${y}`,
              `${cx + bottomHalf},${y + bandHeight - 2}`,
              `${cx - bottomHalf},${y + bandHeight - 2}`,
            ].join(" ")}
            fill={STROKE[stage.tone ?? "accent"]}
            opacity={0.85 - i * 0.18}
          />
        );
      })}
    </svg>
  );
}

/* ── Stat tile — number + visual, the cockpit's building block ────────────── */

export function StatTile({
  label,
  value,
  hint,
  visual,
  tone = "accent",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  visual?: ReactNode;
  tone?: ChartTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground-muted">{label}</p>
        <p className="metric mt-1 text-2xl font-semibold" style={{ color: STROKE[tone] }}>
          {value}
        </p>
        {hint && <p className="mt-0.5 truncate text-[11px] text-foreground-muted">{hint}</p>}
      </div>
      {visual}
    </div>
  );
}
