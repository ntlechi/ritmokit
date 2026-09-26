"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarRange, ChevronDown, ClipboardCheck, Phone, UserPlus } from "lucide-react";
import { ClassCard, type ClassCardData } from "@/components/dance/class-card";
import { ClassWeekGrid } from "@/components/dance/class-week-grid";
import { MarginAlerts } from "@/components/dashboard/dance/margin-alerts";
import { ParityRadar } from "@/components/dashboard/dance/parity-radar";
import { ProfitMatrix } from "@/components/dashboard/dance/profit-matrix";
import { ProgressionFunnel } from "@/components/dashboard/dance/progression-funnel";
import { RoomHeatmap } from "@/components/dashboard/dance/room-heatmap";
import { StudioPulse } from "@/components/dashboard/dance/studio-pulse";
import { OwnerPulseStrip } from "@/components/dashboard/dance/owner-pulse";
import { classSlotLabel, relativeDayLabel } from "@/lib/dance/class-display";
import type { AccueilClassCard } from "@/lib/data/accueil-roster";
import { dna } from "@/lib/design/dna";
import type { StudioCockpitData } from "@/lib/data/studio-cockpit";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

function tonightCard(cls: AccueilClassCard, dict: Dictionary): ClassCardData {
  const seated = cls.roster.filter((r) => !r.waitlisted);
  return {
    id: cls.sessionId,
    title: cls.courseTitle,
    style: cls.style,
    levelLabel: dict.dance.levels[cls.level as keyof typeof dict.dance.levels] ?? cls.level,
    startLabel: cls.startLabel,
    endLabel: cls.endLabel,
    roomName: cls.roomName,
    instructorName: cls.instructorName,
    leads: cls.leads.filled,
    follows: cls.follows.filled,
    booked: seated.length,
    capacity: cls.leads.max + cls.follows.max,
    waitlisted: cls.waitlistedCount,
    newStudents: seated.filter((r) => r.firstVisit).length,
    maxImbalance: cls.maxImbalance,
    isSocial: cls.isSocial,
    status: cls.status,
  };
}

/**
 * Today-first cockpit: what's happening tonight and who needs a call come
 * before the week, and the deep analytics sit collapsed underneath.
 */
export function StudioCockpit({
  lang,
  data,
  dict,
}: {
  lang: Locale;
  data: StudioCockpitData;
  dict: Dictionary;
}) {
  const router = useRouter();
  const c = dict.studioCockpit;
  const ops = dict.studioOps;
  const { analytics } = data;
  const live = data.tonight.some((cls) => cls.status === "live");

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {c.badge}
            </p>
            {live && (
              <span className={cn(dna.liveBadge)}>
                <span className="live-pulse" aria-hidden />
                {c.liveBadge}
              </span>
            )}
          </div>
          <h1 className="display-title mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {c.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
            {c.subtitle.replace("{location}", data.locationName)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${lang}/accueil`} className={dna.ctaGhost}>
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            {dict.nav.accueil}
          </Link>
          <Link href={`/${lang}/sessions`} className={dna.cta}>
            <CalendarRange className="h-4 w-4" aria-hidden />
            {c.tools.sessions}
          </Link>
        </div>
      </header>

      <OwnerPulseStrip pulse={data.ownerPulse} lang={lang} dict={dict} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={cn(dna.panel, "p-4 sm:p-5")}>
          <SectionHeader
            title={ops.cockpit.todayTitle}
            subtitle={ops.cockpit.todaySubtitle}
            href={`/${lang}/accueil`}
            cta={dict.nav.accueil}
          />
          {data.tonight.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-foreground-muted">
              {dict.accueil.empty}
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {data.tonight.map((cls) => (
                <li key={cls.sessionId}>
                  <ClassCard
                    data={tonightCard(cls, dict)}
                    copy={ops.classCard}
                    href={`/${lang}/accueil`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <NewStudentsPreview lang={lang} dict={dict} preview={data.newStudents} />
      </div>

      {data.week && (
        <section className={cn(dna.panel, "p-4 sm:p-5")}>
          <SectionHeader
            title={ops.cockpit.weekTitle}
            subtitle={ops.cockpit.weekSubtitle}
            href={`/${lang}/planning`}
            cta={dict.nav.planning}
          />
          <div className="mt-4">
            <ClassWeekGrid
              events={data.week.events.filter((e) => e.kind === "class")}
              weekStart={data.week.rangeFrom}
              todayCivil={data.todayCivil}
              lang={lang}
              dict={dict}
              selectedId={null}
              onSelect={() => router.push(`/${lang}/planning`)}
            />
          </div>
        </section>
      )}

      <details className={cn(dna.panel, "group")}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold">{ops.cockpit.analyticsTitle}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-muted">
            <span className="group-open:hidden">{ops.cockpit.showAnalytics}</span>
            <span className="hidden group-open:inline">{ops.cockpit.hideAnalytics}</span>
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="flex flex-col gap-6 border-t border-border px-4 py-5 sm:px-5">
          <StudioPulse analytics={analytics} lang={lang} dict={dict} />
          <div className="grid gap-4 xl:grid-cols-2">
            <ParityRadar
              parity={analytics.parity}
              blockedRevenue={analytics.aggregates.blockedRevenue}
              lang={lang}
              dict={dict}
            />
            <ProfitMatrix rows={analytics.classRows} lang={lang} dict={dict} />
          </div>
          <MarginAlerts rows={analytics.classRows} lang={lang} dict={dict} />
          <div className="grid gap-4 xl:grid-cols-2">
            <RoomHeatmap cells={analytics.heatmap} lang={lang} dict={dict} />
            <ProgressionFunnel
              progression={analytics.progression}
              churnRiskStudents={analytics.churnRiskStudents}
              dict={dict}
            />
          </div>
        </div>
      </details>

      {analytics.aggregates.classCount === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface-muted/50 px-4 py-8 text-center">
          <p className="text-sm font-medium">{c.emptyTitle}</p>
          <p className="mt-1 text-sm text-foreground-muted">{c.emptyHint}</p>
          <Link href={`/${lang}/sessions`} className={cn(dna.cta, "mt-4")}>
            {c.emptyCta}
          </Link>
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  href,
  cta,
}: {
  title: string;
  subtitle: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-foreground-muted">{subtitle}</p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function NewStudentsPreview({
  lang,
  dict,
  preview,
}: {
  lang: Locale;
  dict: Dictionary;
  preview: StudioCockpitData["newStudents"];
}) {
  const copy = dict.studioOps.intake;
  return (
    <section className={cn(dna.panel, "flex flex-col p-4 sm:p-5")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
            <UserPlus className="h-4 w-4 text-accent" aria-hidden />
            {copy.previewTitle}
          </h2>
          {preview.openCount > 0 && (
            <p className="text-xs font-semibold text-danger">
              {copy.countOpen.replace("{n}", String(preview.openCount))}
            </p>
          )}
        </div>
        <Link
          href={`/${lang}/students/new`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          {copy.previewCta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {preview.rows.length === 0 ? (
        <p className="mt-4 flex-1 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-foreground-muted">
          {copy.previewEmpty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {preview.rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/${lang}/students/${row.student.id}`}
                  className="block truncate text-sm font-semibold hover:underline"
                >
                  {row.student.fullName}
                </Link>
                <p className="truncate text-xs text-foreground-muted">
                  {row.firstClass
                    ? `${row.firstClass.courseTitle} · ${classSlotLabel(lang, row.firstClass.dayOfWeek, row.firstClass.startTime)}`
                    : copy.sources[row.source]}
                  {" · "}
                  {relativeDayLabel(row.createdAt, copy)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  row.status === "NEW" ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning",
                )}
              >
                {copy.statuses[row.status]}
              </span>
              {row.student.phone && (
                <a
                  href={`tel:${row.student.phone}`}
                  className={cn(dna.iconBtn, "h-9 w-9")}
                  aria-label={`${copy.call} ${row.student.fullName}`}
                >
                  <Phone className="h-4 w-4" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
