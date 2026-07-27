import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  HandHeart,
  MessageSquareWarning,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import type { CultureHealthDashboard } from "@/lib/data/culture";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { InitCultureConstitutionButton } from "@/components/culture/init-constitution-button";
import { RsiInsightCards } from "@/components/culture/rsi-insight-cards";
import { RsiPlaybookCards } from "@/components/culture/rsi-playbook-cards";
import { AutopilotLoopPanel } from "@/components/culture/autopilot-loop-panel";
import { RsiExperimentCards } from "@/components/culture/rsi-experiment-cards";
import { cn } from "@/lib/utils";

function scoreTone(average: number | null): string {
  if (average == null) return "text-foreground-muted";
  if (average >= 4) return "text-success";
  if (average >= 3) return "text-accent";
  if (average >= 2) return "text-warning";
  return "text-danger";
}

export function CultureHealthView({
  dashboard,
  dict,
  lang,
  hideConstitutionList = false,
}: {
  dashboard: CultureHealthDashboard;
  dict: Dictionary;
  lang: Locale;
  /** When the full editor is rendered above, skip the read-only value list. */
  hideConstitutionList?: boolean;
}) {
  const valueTitle =
    dashboard.currentValueKey &&
    dashboard.values.find((v) => v.valueKey === dashboard.currentValueKey)?.title;

  return (
    <div className="space-y-6">
      <RsiInsightCards insights={dashboard.openInsights} dict={dict} lang={lang} />
      <RsiPlaybookCards proposals={dashboard.playbookProposals} dict={dict} />
      <AutopilotLoopPanel runs={dashboard.autopilotRuns} dict={dict} lang={lang} />
      <RsiExperimentCards
        experiments={dashboard.experiments}
        organizationId={dashboard.organizationId}
        dict={dict}
      />

      {!dashboard.constitutionReady ? (
        <section className="rounded-2xl border border-warning/30 bg-warning/5 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{dict.culture.constitutionMissing}</h2>
              <p className="mt-1 text-xs text-foreground-muted">{dict.culture.constitutionMissingHint}</p>
              <div className="mt-3">
                <InitCultureConstitutionButton
                  organizationId={dashboard.organizationId}
                  dict={dict}
                />
              </div>
            </div>
          </div>
        </section>
      ) : !hideConstitutionList ? (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                {dict.culture.constitutionTitle}
              </p>
              <h2 className="mt-1 text-base font-semibold">{dashboard.locationName}</h2>
            </div>
            <Shield className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <ul className="mt-4 space-y-3">
            {dashboard.values.map((value) => (
              <li
                key={value.valueKey}
                className={cn(
                  "rounded-xl border px-4 py-3",
                  dashboard.currentValueKey === value.valueKey
                    ? "border-accent/40 bg-accent-muted/40"
                    : "border-border-subtle bg-surface-muted",
                )}
              >
                <p className="text-sm font-semibold">{value.title}</p>
                <p className="mt-1 text-xs text-foreground-muted">{value.behavior}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {dict.culture.weekLabel
                .replace("{week}", String(dashboard.weekNumber))
                .replace("{year}", String(dashboard.year))}
            </p>
            <h2 className="mt-1 text-sm font-semibold">{dict.culture.pulseTitle}</h2>
          </div>
          <Activity className="h-4 w-4 text-accent" aria-hidden />
        </div>
        {dashboard.currentPulseQuestion && (
          <p className="mt-2 text-xs text-foreground-muted">
            {valueTitle ? `${valueTitle} · ` : ""}
            {dashboard.currentPulseQuestion}
          </p>
        )}
        <div className="mt-4 flex items-end gap-3">
          <p
            className={cn(
              "metric text-4xl font-semibold tracking-tight",
              scoreTone(dashboard.pulseOverall),
            )}
          >
            {dashboard.pulseOverall != null ? dashboard.pulseOverall.toFixed(1) : "—"}
          </p>
          <div className="pb-1 text-sm text-foreground-muted">
            <p>{dict.culture.avgLabel}</p>
            <p>
              {dict.culture.responseCount.replace(
                "{count}",
                String(dashboard.pulseResponseCount),
              )}
            </p>
          </div>
        </div>
        {dashboard.pulseByStation.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">{dict.culture.pulseEmpty}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {dashboard.pulseByStation.map((row) => (
              <li
                key={row.stationId}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                  row.isAlert
                    ? "border-danger/30 bg-danger/5"
                    : "border-border-subtle bg-surface-muted",
                )}
              >
                <div className="flex items-center gap-2">
                  {row.isAlert && (
                    <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-hidden />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {stationLabel(
                        { nameFr: row.stationNameFr, nameEn: row.stationNameEn, nameEs: row.stationNameEs },
                        lang,
                      )}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {dict.culture.responseCount.replace("{count}", String(row.count))}
                    </p>
                  </div>
                </div>
                <p className={cn("metric text-xl font-semibold", scoreTone(row.averageScore))}>
                  {row.averageScore.toFixed(1)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/${lang}/settings/manager/pulse`}
          className="mt-4 inline-flex text-sm font-medium text-accent hover:underline"
        >
          {dict.culture.openPulse} →
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <SignalCard
          icon={UserPlus}
          title={dict.culture.onboardingOverdue}
          value={String(dashboard.overdueOnboardingCount)}
          alert={dashboard.overdueOnboardingCount > 0}
          href={`/${lang}/settings/manager/onboarding`}
          linkLabel={dict.culture.openOnboarding}
        />
        <SignalCard
          icon={Users}
          title={dict.culture.noBuddy}
          value={String(dashboard.recruitsWithoutBuddy)}
          alert={dashboard.recruitsWithoutBuddy > 0}
          href={`/${lang}/settings/manager/onboarding`}
          linkLabel={dict.culture.openOnboarding}
        />
        <SignalCard
          icon={MessageSquareWarning}
          title={dict.culture.pendingFeedback}
          value={String(dashboard.pendingFeedbackCount)}
          alert={dashboard.pendingFeedbackCount > 0}
          meta={
            dashboard.feedbackCompletionRate != null
              ? dict.culture.feedbackRate.replace(
                  "{rate}",
                  String(dashboard.feedbackCompletionRate),
                )
              : undefined
          }
          href={`/${lang}/pointeuse`}
          linkLabel={dict.culture.openPunch}
        />
        <SignalCard
          icon={ClipboardCheck}
          title={dict.culture.sealedReviews}
          value={String(dashboard.sealedReviewsCount)}
          alert={false}
          href={`/${lang}/settings/manager/reviews`}
          linkLabel={dict.culture.openReviews}
        />
        <SignalCard
          icon={HandHeart}
          title={dict.culture.shoutOutsWeek}
          value={String(dashboard.shoutOutsWeekCount)}
          alert={false}
          href={`/${lang}/calendar/mobile`}
          linkLabel={dict.culture.openMobile}
        />
      </section>

      {dashboard.shoutOutsByValue.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{dict.culture.shoutOutsByValue}</h2>
          <ul className="mt-3 space-y-2">
            {dashboard.shoutOutsByValue.map((row) => (
              <li
                key={row.valueKey}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-muted px-4 py-2.5"
              >
                <p className="text-sm font-medium">{row.title}</p>
                <p className="metric text-sm font-semibold text-accent">{row.count}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-foreground-muted">{dict.culture.frameworkNote}</p>
    </div>
  );
}

function SignalCard({
  icon: Icon,
  title,
  value,
  alert,
  meta,
  href,
  linkLabel,
}: {
  icon: typeof UserPlus;
  title: string;
  value: string;
  alert: boolean;
  meta?: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-surface p-4 shadow-sm",
        alert ? "border-warning/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className={cn("h-4 w-4", alert ? "text-warning" : "text-accent")} aria-hidden />
        <p
          className={cn(
            "metric text-2xl font-semibold",
            alert ? "text-warning" : "text-foreground",
          )}
        >
          {value}
        </p>
      </div>
      <p className="mt-2 text-sm font-medium">{title}</p>
      {meta && <p className="mt-0.5 text-xs text-foreground-muted">{meta}</p>}
      <Link href={href} className="mt-3 inline-flex text-xs font-medium text-accent hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}
