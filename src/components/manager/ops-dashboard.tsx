"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  ClipboardList,
  FileText,
  HeartPulse,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { sendConventionRemindersAction } from "@/lib/actions/workplace-convention";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { ManagerOpsDashboard } from "@/lib/data/manager-ops-dashboard";

const LaborSalesChart = dynamic(
  () => import("@/components/manager/labor-sales-chart").then((m) => m.LaborSalesChart),
  {
    loading: () => (
      <div className="premium-card h-[320px] animate-pulse bg-zinc-100/80 dark:bg-zinc-800/40" aria-hidden />
    ),
  },
);

const KpiCommandCenter = dynamic(
  () => import("@/components/manager/kpi-command-center").then((m) => m.KpiCommandCenter),
  {
    loading: () => (
      <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" aria-hidden />
    ),
  },
);

export type OpsDashboardCopy = {
  title: string;
  subtitle: string;
  live: string;
  laborCost: string;
  laborCostHint: string;
  vsLastWeek: string;
  onFloor: string;
  onFloorHint: string;
  compliance: string;
  complianceHint: string;
  complianceAllClear: string;
  culture: string;
  cultureHint: string;
  shoutOutsToday: string;
  efficiencyTitle: string;
  efficiencySubtitle: string;
  laborSeries: string;
  salesSeries: string;
  peakZone: string;
  overstaffed: string;
  understaffed: string;
  noCrisis: string;
  crisisTitle: string;
  crisisVacant: string;
  crisisNotified: string;
  crisisSurge: string;
  hoursShort: string;
  toolsTitle: string;
  openSchedule: string;
  openTeam: string;
  openModules: string;
  toolTips: string;
  toolSops: string;
  toolPos: string;
  emptyFloor: string;
  noData: string;
  convention: string;
  conventionHint: string;
  conventionAllSigned: string;
  conventionPendingBanner: string;
  conventionRemindCta: string;
  conventionReminding: string;
  conventionRemindSuccess: string;
  conventionRemindCooldown: string;
  conventionRemindAllSigned: string;
  conventionOpenManager: string;
};

type Props = {
  lang: Locale;
  data: ManagerOpsDashboard;
  copy: OpsDashboardCopy;
  dict: Dictionary;
};

function stationLabel(
  row: ManagerOpsDashboard["onFloorByStation"][number],
  lang: Locale,
) {
  if (lang === "en") return row.nameEn;
  if (lang === "es") return row.nameEs;
  return row.nameFr;
}

function crisisStation(crisis: ManagerOpsDashboard["crises"][number], lang: Locale) {
  if (lang === "en") return crisis.stationNameEn;
  if (lang === "es") return crisis.stationNameEs;
  return crisis.stationNameFr;
}

function formatMoney(value: number, lang: Locale) {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-ES" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function Sparkline({ values, tone }: { values: number[]; tone?: "zinc" | "red" }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const w = 88;
  const h = 28;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke = tone === "red" ? "var(--danger)" : "var(--foreground)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible opacity-50" aria-hidden>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

const TOOL_LINKS = [
  { href: "/calendar/manager/schedule", icon: ClipboardList, key: "schedule" as const },
  { href: "/team", icon: Users, key: "team" as const },
  { href: "/settings/manager", icon: LayoutDashboard, key: "modules" as const },
  { href: "/sessions", icon: Sparkles, key: "demo" as const, label: "Sessions" },
  { href: "/rooms", icon: LayoutDashboard, key: "tablet" as const, label: "Salles" },
  { href: "/sops", icon: BookOpen, key: "sops" as const },
] as const;

export function OpsDashboard({ lang, data, copy, dict }: Props) {
  const [remindError, setRemindError] = useState<string | null>(null);
  const [remindSuccess, setRemindSuccess] = useState<string | null>(null);
  const [isReminding, startRemind] = useTransition();

  const laborPct = data.labor?.liveLaborCostPercentage ?? null;
  const sparkLabor = data.labor?.buckets.slice(6, 23).map((b) => b.laborCost) ?? [];
  const sparkSales = data.labor?.buckets.slice(6, 23).map((b) => b.actualSales ?? b.projectedSales) ?? [];
  const sparkCulture = [3.8, 4.1, 4.0, 4.4, 4.2, 4.6, data.cultureScore ?? 4.5];
  const sparkCompliance = [92, 94, 95, 96, 97, 97, data.compliancePercent];
  const sparkConvention = [
    70,
    78,
    82,
    88,
    90,
    data.conventionSignedPercent,
    data.conventionSignedPercent,
  ];

  const delta = data.weekLaborDeltaPts;
  const deltaGood = delta != null && delta <= 0;

  function sendReminders() {
    setRemindError(null);
    setRemindSuccess(null);
    startRemind(async () => {
      const result = await sendConventionRemindersAction(lang);
      if (!result.ok) {
        const map: Record<string, string> = {
          unauthorized: copy.conventionRemindCooldown,
          all_signed: copy.conventionRemindAllSigned,
          cooldown: copy.conventionRemindCooldown,
          no_location: copy.noData,
          database_error: copy.noData,
        };
        setRemindError(map[result.error] ?? copy.noData);
        return;
      }
      setRemindSuccess(
        copy.conventionRemindSuccess.replace("{count}", String(result.dmCount)),
      );
    });
  }

  return (
    <div className="premium-shell relative isolate min-h-full overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
          <div>
            <p className="premium-eyebrow">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              {copy.live} · {data.locationName}
            </p>
            <h1 className="display-title mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-foreground-muted">{copy.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/${lang}/calendar/manager/schedule`} className="premium-cta">
              <Sparkles className="h-4 w-4" aria-hidden />
              {copy.openSchedule}
            </Link>
            <Link href={`/${lang}/settings/manager`} className="premium-cta-ghost">
              {copy.openModules}
            </Link>
          </div>
        </header>

        {data.conventionPendingCount > 0 ? (
          <div className="premium-banner animate-fade-up" data-tone="amber" style={{ animationDelay: "40ms" }}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="premium-icon" data-tone="amber">
                  <FileText className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-warning">
                    {copy.convention}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {copy.conventionPendingBanner
                      .replace("{count}", String(data.conventionPendingCount))
                      .replace("{version}", data.conventionVersion)}
                  </p>
                  {remindSuccess && (
                    <p className="mt-2 text-xs text-success">{remindSuccess}</p>
                  )}
                  {remindError && <p className="mt-2 text-xs text-danger">{remindError}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isReminding}
                  onClick={sendReminders}
                  className="inline-flex items-center gap-2 rounded-full bg-warning px-4 py-2 text-sm font-semibold text-white shadow-[0_0_16px_color-mix(in_srgb,var(--warning)_35%,transparent)] transition hover:brightness-110 disabled:opacity-60"
                >
                  <Bell className="h-4 w-4" aria-hidden />
                  {isReminding ? copy.conventionReminding : copy.conventionRemindCta}
                </button>
                <Link
                  href={`/${lang}/settings/manager/convention`}
                  className="premium-cta-ghost"
                >
                  {copy.conventionOpenManager}
                </Link>
              </div>
            </div>
          </div>
        ) : data.conventionTotalEmployees > 0 ? (
          <div className="premium-banner text-sm" data-tone="emerald">
            <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-success" aria-hidden />
            {copy.conventionAllSigned}
          </div>
        ) : null}

        {data.crises.length > 0 ? (
          <div className="premium-banner relative overflow-hidden" data-tone="rose">
            <div className="pointer-events-none absolute -left-10 top-0 h-full w-24 animate-pulse bg-danger/15 blur-2xl" aria-hidden />
            <div className="relative flex items-start gap-3">
              <div className="premium-icon" data-tone="rose">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-danger">
                  {copy.crisisTitle}
                </p>
                {data.crises.map((crisis) => (
                  <p key={crisis.shiftId} className="text-sm leading-relaxed text-foreground">
                    <span className="font-semibold text-danger">
                      {copy.crisisVacant
                        .replace("{station}", crisisStation(crisis, lang))
                        .replace(
                          "{hours}",
                          crisis.hoursUntilStart < 1
                            ? `${Math.round(crisis.hoursUntilStart * 60)} min`
                            : `${crisis.hoursUntilStart.toFixed(1)}${copy.hoursShort}`,
                        )}
                    </span>{" "}
                    {copy.crisisNotified.replace("{count}", String(crisis.notifiedCount))}
                    {crisis.surgeBonus != null &&
                      ` ${copy.crisisSurge.replace("{bonus}", crisis.surgeBonus.toFixed(2))}`}
                  </p>
                ))}
              </div>
              <Link
                href={`/${lang}/calendar/week`}
                className="shrink-0 rounded-full bg-danger px-3 py-1.5 text-xs font-semibold text-white shadow-[0_0_16px_color-mix(in_srgb,var(--danger)_40%,transparent)]"
              >
                Code Rouge
              </Link>
            </div>
          </div>
        ) : (
          <div className="premium-banner text-sm" data-tone="emerald">
            <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-success shadow-[0_0_8px_color-mix(in_srgb,var(--success)_60%,transparent)]" />
            {copy.noCrisis}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <article className="premium-kpi p-5" data-tone="indigo">
            <div className="flex items-start justify-between gap-3">
              <div className="premium-icon">
                <Wallet className="h-5 w-5" aria-hidden />
              </div>
              <Sparkline values={sparkLabor} tone="red" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              {copy.laborCost}
            </p>
            <p className="metric mt-1 text-3xl font-bold text-foreground">
              {laborPct != null ? `${laborPct.toFixed(1)}%` : copy.noData}
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs text-foreground-muted">
              {delta != null ? (
                <>
                  {deltaGood ? (
                    <ArrowDownRight className="h-3.5 w-3.5 text-success" aria-hidden />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 text-warning" aria-hidden />
                  )}
                  <span className={deltaGood ? "text-success" : "text-warning"}>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)} pts
                  </span>
                  <span>· {copy.vsLastWeek}</span>
                </>
              ) : (
                copy.laborCostHint
              )}
            </p>
          </article>

          <article className="premium-kpi p-5" data-tone="cyan">
            <div className="flex items-start justify-between gap-3">
              <div className="premium-icon" data-tone="cyan">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <Sparkline values={sparkSales} />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              {copy.onFloor}
            </p>
            <p className="metric mt-1 text-3xl font-bold text-foreground">
              {data.onFloorTotal}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
              {data.onFloorByStation.length === 0
                ? copy.emptyFloor
                : data.onFloorByStation
                    .slice(0, 4)
                    .map((s) => `${s.count} ${stationLabel(s, lang)}`)
                    .join(" · ")}
            </p>
          </article>

          <article className="premium-kpi p-5" data-tone="violet">
            <div className="flex items-start justify-between gap-3">
              <div className="premium-icon" data-tone="violet">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </div>
              <Sparkline values={sparkCompliance} />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              {copy.compliance}
            </p>
            <p className="metric mt-1 text-3xl font-bold text-foreground">
              {data.compliancePercent.toFixed(0)}%
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              {data.complianceActiveShifts === 0
                ? copy.complianceAllClear
                : copy.complianceHint
                    .replace("{certified}", String(data.complianceCertifiedShifts))
                    .replace("{total}", String(data.complianceActiveShifts))}
            </p>
          </article>

          <article className="premium-kpi p-5" data-tone="fuchsia">
            <div className="flex items-start justify-between gap-3">
              <div className="premium-icon" data-tone="fuchsia">
                <HeartPulse className="h-5 w-5" aria-hidden />
              </div>
              <Sparkline values={sparkCulture} />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              {copy.culture}
            </p>
            <p className="metric mt-1 text-3xl font-bold text-foreground">
              {data.cultureScore != null ? `${data.cultureScore.toFixed(1)} / 5` : copy.noData}
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              {data.pulseResponseCount > 0
                ? copy.shoutOutsToday.replace("{count}", String(data.shoutOutsToday)) +
                  ` · ${data.pulseResponseCount} Pulse`
                : copy.shoutOutsToday.replace("{count}", String(data.shoutOutsToday))}
            </p>
          </article>

          <article className="premium-kpi p-5" data-tone="amber">
            <div className="flex items-start justify-between gap-3">
              <div className="premium-icon" data-tone="amber">
                <FileText className="h-5 w-5" aria-hidden />
              </div>
              <Sparkline values={sparkConvention} />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
              {copy.convention}
            </p>
            <p className="metric mt-1 text-3xl font-bold text-foreground">
              {data.conventionSignedPercent.toFixed(0)}%
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              {data.conventionTotalEmployees === 0
                ? copy.noData
                : copy.conventionHint
                    .replace("{signed}", String(data.conventionSignedCount))
                    .replace("{total}", String(data.conventionTotalEmployees))
                    .replace("{version}", data.conventionVersion)}
            </p>
          </article>
        </section>

        {data.labor ? (
          <LaborSalesChart data={data.labor} copy={copy} />
        ) : (
          <div className="premium-card p-8 text-center text-sm text-foreground-muted">
            {copy.noData}
          </div>
        )}

        {data.labor && (
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="premium-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
                Labor $
              </p>
              <p className="metric mt-1 text-2xl font-semibold text-foreground">
                {formatMoney(data.labor.totalLaborCost, lang)}
              </p>
            </div>
            <div className="premium-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
                Sales
              </p>
              <p className="metric mt-1 text-2xl font-semibold text-foreground">
                {formatMoney(data.labor.totalProjectedSales, lang)}
              </p>
            </div>
            <div className="premium-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
                SPLH
              </p>
              <p className="metric mt-1 text-2xl font-semibold text-foreground">
                {formatMoney(data.labor.dailySplh, lang)}
              </p>
            </div>
          </section>
        )}

        <KpiCommandCenter snapshot={data.kpiSnapshot} dict={dict} lang={lang} />

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{copy.toolsTitle}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOOL_LINKS.map((tool) => {
              const { href, icon: Icon, key } = tool;
              const label =
                "label" in tool
                  ? tool.label
                  : key === "schedule"
                    ? copy.openSchedule
                    : key === "team"
                      ? copy.openTeam
                      : key === "modules"
                        ? copy.openModules
                        : key === "sops"
                          ? copy.toolSops
                          : copy.openModules;
              return (
                <Link key={key} href={`/${lang}${href}`} className="premium-link-tile">
                  <span className="premium-icon h-9 w-9">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
