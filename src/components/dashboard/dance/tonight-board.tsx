"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { ClassEconomicsRow, ParitySnapshot } from "@/lib/dance/analytics";
import { dna } from "@/lib/design/dna";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

function formatClock(iso: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-ES" : "fr-CA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function statusLabel(
  status: ParitySnapshot["status"],
  waitlisted: number,
  c: Dictionary["studioCockpit"],
) {
  if (status === "balanced") return c.parity.balanced;
  if (waitlisted > 0) return c.tonight.waitlistOpen;
  return c.parity.blocked;
}

function statusTone(status: ParitySnapshot["status"]) {
  if (status === "balanced") return "border-success/40 bg-success/10 text-success";
  if (status === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-margin-alert/40 bg-margin-alert/10 text-margin-alert";
}

function RoleMeter({
  label,
  filled,
  max,
  tone,
}: {
  label: string;
  filled: number;
  max: number;
  tone: "lead" | "follow";
}) {
  const pct = max > 0 ? Math.min(100, (filled / max) * 100) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className={tone === "lead" ? "text-role-lead" : "text-role-follow"}>{label}</span>
        <span className="metric font-semibold tabular-nums text-foreground">
          {filled}/{max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            tone === "lead" ? "bg-role-lead" : "bg-role-follow",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TonightBoard({
  classRows,
  parity,
  lang,
  dict,
}: {
  classRows: ClassEconomicsRow[];
  parity: ParitySnapshot[];
  lang: Locale;
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;
  const parityById = useMemo(() => new Map(parity.map((p) => [p.sessionId, p])), [parity]);

  const { tonight, hasLive } = useMemo(() => {
    const now = new Date();
    const today = now.getDay();
    const rows = classRows
      .filter((row) => {
        if (row.dayOfWeek === today) return true;
        // One-off dated classes (dayOfWeek null) — match calendar day.
        const start = new Date(row.startTimeIso);
        return (
          start.getFullYear() === now.getFullYear() &&
          start.getMonth() === now.getMonth() &&
          start.getDate() === now.getDate()
        );
      })
      .map((row) => {
        const start = new Date(row.startTimeIso);
        const end = new Date(row.endTimeIso);
        // Recurring rows store time-of-day on a fixed epoch date — project onto today.
        const startToday = new Date(now);
        startToday.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
        const endToday = new Date(now);
        endToday.setHours(end.getHours(), end.getMinutes(), end.getSeconds(), 0);
        const useProjected = row.dayOfWeek != null;
        const startAt = useProjected ? startToday : start;
        const endAt = useProjected ? endToday : end;
        const msToStart = startAt.getTime() - now.getTime();
        const live =
          (msToStart <= LIVE_WINDOW_MS && msToStart >= -60_000) ||
          (now >= startAt && now <= endAt);
        return { row, start: startAt, live, parity: parityById.get(row.sessionId) };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    return { tonight: rows, hasLive: rows.some((r) => r.live) };
  }, [classRows, parityById]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">{c.tonight.title}</h2>
            <p className="text-xs text-foreground-muted">{c.tonight.subtitle}</p>
          </div>
        </div>
        {hasLive && (
          <span className={cn(dna.liveBadge)}>
            <span className="live-pulse" aria-hidden />
            {c.liveBadge}
          </span>
        )}
      </div>

      {tonight.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-muted">{c.tonight.empty}</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tonight.map(({ row, live, parity: snap }) => {
            const status = snap?.status ?? (row.imbalance > 2 ? "blocked" : row.imbalance >= 1 ? "warning" : "balanced");
            return (
              <li
                key={row.sessionId}
                className={cn(
                  "rounded-xl border bg-background/60 px-3.5 py-3",
                  live ? "border-live/40 shadow-glow" : "border-border-subtle",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.courseTitle}</p>
                    <p className="mt-0.5 text-[11px] text-foreground-muted">
                      {row.style}
                      {row.level ? ` · ${row.level}` : ""} · {row.roomName}
                    </p>
                    <p className="mt-1 text-xs font-medium tabular-nums text-foreground">
                      {formatClock(row.startTimeIso, lang)} – {formatClock(row.endTimeIso, lang)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                      statusTone(status),
                    )}
                  >
                    {statusLabel(status, row.waitlistedCount, c)}
                  </span>
                </div>
                <div className="mt-3 flex gap-3">
                  <RoleMeter
                    label={c.parity.leads}
                    filled={row.leadsFilled}
                    max={row.maxLeads}
                    tone="lead"
                  />
                  <RoleMeter
                    label={c.parity.follows}
                    filled={row.followsFilled}
                    max={row.maxFollows}
                    tone="follow"
                  />
                </div>
                {live && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-live">
                    <span className="live-pulse" aria-hidden />
                    {c.liveBadge}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href={`/${lang}/sessions`}
        className="mt-4 inline-flex text-xs font-medium text-accent hover:underline"
      >
        {c.tools.sessions} →
      </Link>
    </section>
  );
}
