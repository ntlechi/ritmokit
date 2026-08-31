"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addMonths, addWeeks, addYears, format } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Globe, KeyRound, Music2, X } from "lucide-react";
import { StudioCalendarViews } from "@/components/planning/studio-calendar-views";
import { parseDateParam, type StudioPeriodView } from "@/lib/calendar/grid";
import {
  eventsByDate,
  filterStudioEvents,
  type StudioCalendarEvent,
  type StudioCalendarKind,
  type StudioCalendarPayload,
} from "@/lib/dance/studio-calendar";
import { dna } from "@/lib/design/dna";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const dateFnsLocales = { fr, en: enUS, es } as const;
const VIEWS: StudioPeriodView[] = ["week", "month", "quarter", "year"];

function planningHref(lang: Locale, view: StudioPeriodView, date?: Date) {
  const base = `/${lang}/planning?view=${view}`;
  return date ? `${base}&date=${format(date, "yyyy-MM-dd")}` : base;
}

export function StudioCalendarBoard({
  data,
  lang,
  dict,
  view,
  anchorIso,
  label,
}: {
  data: StudioCalendarPayload;
  lang: Locale;
  dict: Dictionary;
  view: StudioPeriodView;
  anchorIso: string;
  label: string;
}) {
  const t = dict.planning;
  const anchor = parseDateParam(anchorIso);
  const [kind, setKind] = useState<"all" | StudioCalendarKind>("all");
  const [roomId, setRoomId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterStudioEvents(data.events, kind, roomId || null),
    [data.events, kind, roomId],
  );
  const byDate = useMemo(() => eventsByDate(filtered), [filtered]);
  const selected = filtered.find((event) => event.id === selectedId) ?? null;

  const step =
    view === "month" ? addMonths : view === "quarter" ? (d: Date, n: number) => addMonths(d, n * 3) : view === "year" ? addYears : addWeeks;

  return (
    <div className="space-y-4">
      <WebsiteSyncBanner lang={lang} dict={dict} sync={data.sync} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold capitalize tracking-tight">{label}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={planningHref(lang, view, step(anchor, -1))}
            aria-label="‹"
            data-interactive
            className={navBtn}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <Link href={planningHref(lang, view)} data-interactive className={`${navBtn} px-3.5 text-sm font-medium`}>
            {t.today}
          </Link>
          <Link
            href={planningHref(lang, view, step(anchor, 1))}
            aria-label="›"
            data-interactive
            className={navBtn}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={dna.pillTrack} role="tablist" aria-label={t.title}>
          {VIEWS.map((item) => (
            <Link
              key={item}
              href={planningHref(lang, item, anchor)}
              role="tab"
              aria-selected={view === item}
              data-interactive
              className={cn("px-3.5 py-1.5 text-sm font-medium", view === item ? dna.pillActive : dna.pillIdle)}
            >
              {t.views[item]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={dna.pillTrack} role="group" aria-label={t.filterAll}>
            {(
              [
                ["all", t.filterAll],
                ["class", t.filterClasses],
                ["rental", t.filterRentals],
              ] as const
            ).map(([id, labelText]) => (
              <button
                key={id}
                type="button"
                data-interactive
                onClick={() => setKind(id)}
                className={cn("px-3 py-1.5 text-xs font-semibold", kind === id ? dna.pillActive : dna.pillIdle)}
              >
                {labelText}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="planning-room">
            {t.allRooms}
          </label>
          <select
            id="planning-room"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className={cn(dna.field, "min-h-11 w-auto min-w-[10rem] py-2 text-sm")}
          >
            <option value="">{t.allRooms}</option>
            {data.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <StudioCalendarViews
          view={view}
          anchor={anchor}
          byDate={byDate}
          events={filtered}
          locale={lang}
          dict={dict}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <EventDetail event={selected} lang={lang} dict={dict} onClose={() => setSelectedId(null)} />
      </div>
    </div>
  );
}

const navBtn =
  "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground";

function WebsiteSyncBanner({
  lang,
  dict,
  sync,
}: {
  lang: Locale;
  dict: Dictionary;
  sync: StudioCalendarPayload["sync"];
}) {
  const t = dict.planning;
  const live = Boolean(sync.liveSeasonName);

  return (
    <section className={cn(dna.panel, "p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              live ? "bg-live/15 text-live" : "bg-warning/15 text-warning",
            )}
          >
            <Globe className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {live ? t.websiteLive : t.websiteOff}
              {sync.liveSeasonName ? ` · ${sync.liveSeasonName}` : ""}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">{t.websiteHint}</p>
            <p className="mt-1 text-xs font-medium">
              {sync.websiteUrl
                ? t.websiteConnected.replace("{url}", sync.websiteUrl)
                : t.websiteNotConnected}
            </p>
            {sync.liveSeasonRange ? (
              <p className="mt-0.5 text-xs text-foreground-muted">{sync.liveSeasonRange}</p>
            ) : null}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
              <span>
                {t.websiteClasses}: <span className="tabular-nums">{sync.classesOnWebsite}</span>
              </span>
              <span className="text-foreground-muted">
                {t.draftClasses}: <span className="tabular-nums">{sync.draftClasses}</span>
              </span>
              <span>
                {t.pendingRentals}: <span className="tabular-nums">{sync.pendingRentals}</span>
              </span>
              <span className="text-foreground-muted">
                {t.confirmedRentals}: <span className="tabular-nums">{sync.confirmedRentals}</span>
              </span>
            </p>
            <p className="mt-2 break-all font-mono text-[11px] text-foreground-muted">
              {t.publicApiLabel}: {sync.publicScheduleUrl}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sync.websiteUrl ? (
            <a
              href={sync.websiteUrl}
              target="_blank"
              rel="noreferrer"
              data-interactive
              className={cn(dna.ctaGhost, "min-h-11 px-3 text-xs")}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden />
              {t.openWebsite}
            </a>
          ) : (
            <Link
              href={`/${lang}/settings/manager/integrations`}
              data-interactive
              className={cn(dna.ctaGhost, "min-h-11 px-3 text-xs")}
            >
              <Globe className="h-3.5 w-3.5" aria-hidden />
              {t.connectWebsite}
            </Link>
          )}
          <Link href={`/${lang}/sessions`} data-interactive className={cn(dna.ctaGhost, "min-h-11 px-3 text-xs")}>
            <Music2 className="h-3.5 w-3.5" aria-hidden />
            {t.editSessions}
          </Link>
          <Link href={`/${lang}/rentals`} data-interactive className={cn(dna.ctaGhost, "min-h-11 px-3 text-xs")}>
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            {t.manageRentals}
          </Link>
        </div>
      </div>
    </section>
  );
}

function EventDetail({
  event,
  lang,
  dict,
  onClose,
}: {
  event: StudioCalendarEvent | null;
  lang: Locale;
  dict: Dictionary;
  onClose: () => void;
}) {
  const t = dict.planning;
  if (!event) {
    return (
      <aside className={cn(dna.panel, "hidden p-5 text-sm text-foreground-muted xl:block")}>
        <p>{t.emptySelect}</p>
        <p className="mt-3 text-xs">{dict.planning.staffCalendarHint}</p>
        <Link href={`/${lang}/calendar/week`} className="mt-2 inline-block text-xs font-semibold text-accent">
          {dict.nav.calendar}
        </Link>
      </aside>
    );
  }

  const dateLabel = format(parseDateParam(event.date), "EEEE d MMMM", { locale: dateFnsLocales[lang] });

  return (
    <aside className={cn(dna.panel, "p-5")} aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">
            {event.kind === "rental" ? t.kindRental : event.isSocial ? t.kindSocial : t.kindClass}
          </p>
          <h3 className="mt-1 text-base font-semibold">{event.title}</h3>
          <p className="mt-1 text-sm text-foreground-muted">
            {dateLabel} · {event.timeStart}–{event.timeEnd}
          </p>
        </div>
        <button type="button" onClick={onClose} className={cn(dna.iconBtn, "h-11 w-11")} aria-label={t.close}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <Row label={t.room} value={event.roomName} />
        {event.kind === "class" && <Row label={t.instructor} value={event.subtitle} />}
        {event.kind === "rental" && <Row label={t.client} value={event.title} />}
        {event.booked != null && (
          <Row
            label={t.booked}
            value={`${event.booked}${event.capacity != null ? ` / ${event.capacity}` : ""}`}
          />
        )}
        {event.attended != null && event.kind === "class" && (
          <Row label={t.present} value={String(event.attended)} />
        )}
        <Row label={t.status} value={event.status} />
        {event.paymentStatus && <Row label={t.payment} value={event.paymentStatus} />}
      </dl>
      <p
        className={cn(
          "mt-3 rounded-xl px-3 py-2 text-xs font-semibold",
          event.onWebsite ? "bg-live/10 text-live" : "bg-warning/10 text-warning",
        )}
      >
        {event.onWebsite ? t.onWebsite : t.notOnWebsite}
      </p>
      <Link href={event.href} data-interactive className={cn(dna.cta, "mt-4 min-h-11 w-full text-sm")}>
        {event.kind === "class" ? t.editSessions : t.manageRentals}
      </Link>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-foreground-muted">{label}</dt>
      {value ? <dd className="font-medium">{value}</dd> : null}
    </div>
  );
}
