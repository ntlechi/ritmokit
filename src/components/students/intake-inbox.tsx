"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  Globe,
  DoorOpen,
  Mail,
  Phone,
  RotateCcw,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { loadMoreIntakesAction, updateIntakeAction } from "@/lib/actions/intake";
import { classSlotLabel, relativeDayLabel } from "@/lib/dance/class-display";
import { INTAKE_BOARD_ORDER, type IntakeStatusValue } from "@/lib/dance/intake-rules";
import { styleColors } from "@/lib/dance/style-colors";
import type { IntakePage, IntakeRow, IntakeStaffOption } from "@/lib/data/intake";
import { dna } from "@/lib/design/dna";
import type { Locale } from "@/lib/i18n/config";
import type { StudioOpsCopy } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const SOURCE_ICON = { WEBSITE: Globe, DOOR: DoorOpen, STAFF: UsersRound } as const;

const STATUS_DOT: Record<IntakeStatusValue, string> = {
  NEW: "bg-danger",
  CONTACTED: "bg-warning",
  ATTENDED: "bg-live",
  ACTIVE: "bg-success",
  LOST: "bg-foreground-muted",
};

export function IntakeInbox({
  lang,
  status,
  counts,
  initialPage,
  staff,
  copy,
  levels,
}: {
  lang: Locale;
  status: IntakeStatusValue;
  counts: Record<IntakeStatusValue, number>;
  initialPage: IntakePage;
  staff: IntakeStaffOption[];
  copy: StudioOpsCopy["intake"];
  levels: Record<string, string>;
}) {
  const [rows, setRows] = useState<IntakeRow[]>(initialPage.rows);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [liveCounts, setLiveCounts] = useState(counts);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, startLoadMore] = useTransition();

  function moveRow(row: IntakeRow, next: IntakeStatusValue) {
    // The row leaves this tab; counts follow so the tabs stay honest.
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setLiveCounts((prev) => ({ ...prev, [row.status]: prev[row.status] - 1, [next]: prev[next] + 1 }));
  }

  async function changeStatus(row: IntakeRow, next: IntakeStatusValue) {
    setError(null);
    moveRow(row, next);
    const res = await updateIntakeAction({ intakeId: row.id, status: next, lang });
    if (!res.ok) {
      setError(copy.error);
      setRows((prev) => [row, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLiveCounts((prev) => ({ ...prev, [row.status]: prev[row.status] + 1, [next]: prev[next] - 1 }));
    }
  }

  async function assign(row: IntakeRow, assignedToId: string | null) {
    setError(null);
    const before = row.assignedToId;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, assignedToId } : r)));
    const res = await updateIntakeAction({ intakeId: row.id, assignedToId, lang });
    if (!res.ok) {
      setError(copy.error);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, assignedToId: before } : r)));
    }
  }

  function loadMore() {
    if (!cursor) return;
    startLoadMore(async () => {
      const res = await loadMoreIntakesAction({ status, cursor });
      if (!res.ok) {
        setError(copy.error);
        return;
      }
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...res.page.rows.filter((r) => !seen.has(r.id))];
      });
      setCursor(res.page.nextCursor);
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label={copy.title}>
        {INTAKE_BOARD_ORDER.map((s) => {
          const active = s === status;
          return (
            <Link
              key={s}
              href={`/${lang}/students/new?status=${s}`}
              aria-current={active ? "page" : undefined}
              title={copy.statusHints[s]}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                active
                  ? "border-accent bg-accent text-accent-foreground shadow-xs"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              <span
                className={cn("h-2 w-2 rounded-full", active ? "bg-accent-foreground" : STATUS_DOT[s])}
                aria-hidden
              />
              {copy.statuses[s]}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  active ? "bg-accent-foreground/20" : "bg-surface-muted text-foreground-muted",
                )}
              >
                {liveCounts[s]}
              </span>
            </Link>
          );
        })}
      </nav>

      <p className="text-sm text-foreground-muted">{copy.statusHints[status]}</p>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className={cn(dna.panel, "px-6 py-12 text-center text-sm text-foreground-muted")}>
          {liveCounts.NEW + liveCounts.CONTACTED + liveCounts.ATTENDED + liveCounts.ACTIVE + liveCounts.LOST === 0
            ? copy.empty
            : copy.emptyColumn}
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {rows.map((row) => (
            <IntakeCard
              key={row.id}
              row={row}
              lang={lang}
              staff={staff}
              copy={copy}
              levels={levels}
              onStatus={(next) => changeStatus(row, next)}
              onAssign={(id) => assign(row, id)}
            />
          ))}
        </ul>
      )}

      {cursor && (
        <div className="flex justify-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className={dna.ctaGhost}>
            {copy.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}

function IntakeCard({
  row,
  lang,
  staff,
  copy,
  levels,
  onStatus,
  onAssign,
}: {
  row: IntakeRow;
  lang: Locale;
  staff: IntakeStaffOption[];
  copy: StudioOpsCopy["intake"];
  levels: Record<string, string>;
  onStatus: (next: IntakeStatusValue) => void;
  onAssign: (id: string | null) => void;
}) {
  const SourceIcon = SOURCE_ICON[row.source];
  const first = row.firstClass;
  const seat = first?.seat ?? null;
  const open = row.status === "NEW" || row.status === "CONTACTED";

  return (
    <li className={cn(dna.panel, "flex flex-col gap-3 p-4")}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
          {initials(row.student.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{row.student.fullName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground-muted">
            <span className="inline-flex items-center gap-1">
              <SourceIcon className="h-3.5 w-3.5" aria-hidden />
              {copy.sources[row.source]}
            </span>
            <span aria-hidden>·</span>
            <span>{copy.signedUp.replace("{when}", relativeDayLabel(row.createdAt, copy))}</span>
          </p>
        </div>
        {open && (
          <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
            {copy.firstClass}
          </span>
        )}
      </div>

      {first && (
        <div
          className="rounded-xl px-3 py-2 text-sm"
          style={{ background: styleColors(first.style).soft }}
        >
          <p className="font-semibold">
            {copy.firstClassOn.replace("{when}", classSlotLabel(lang, first.dayOfWeek, first.startTime))}
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {first.courseTitle} · {levels[first.level] ?? first.level}
          </p>
          {seat && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <SeatChip
                tone={seat.paid ? "ok" : seat.pendingInterac ? "warn" : "bad"}
                label={seat.paid ? copy.paid : seat.pendingInterac ? copy.pendingInterac : copy.unpaid}
              />
              {seat.waitlisted && <SeatChip tone="warn" label={copy.waitlisted} />}
              {seat.danceRole !== "SOLO" && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    seat.danceRole === "LEAD"
                      ? "bg-role-lead/15 text-role-lead"
                      : "bg-role-follow/15 text-role-follow",
                  )}
                >
                  {seat.danceRole === "LEAD" ? "Lead" : "Follow"}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {row.student.phone && (
          <a href={`tel:${row.student.phone}`} className={cn(dna.cta, "min-h-10 px-3 py-2")}>
            <Phone className="h-4 w-4" aria-hidden />
            {copy.call}
          </a>
        )}
        <a
          href={`mailto:${row.student.email}`}
          className={cn(row.student.phone ? dna.ctaGhost : dna.cta, "min-h-10 px-3 py-2")}
        >
          <Mail className="h-4 w-4" aria-hidden />
          {copy.email}
        </a>
        {row.status === "NEW" && (
          <button
            type="button"
            onClick={() => onStatus("CONTACTED")}
            className={cn(dna.ctaGhost, "min-h-10 px-3 py-2")}
          >
            <Check className="h-4 w-4" aria-hidden />
            {copy.markContacted}
          </button>
        )}
        <Link
          href={`/${lang}/students/${row.student.id}`}
          className={cn(dna.ctaGhost, "min-h-10 px-3 py-2")}
        >
          <UserRound className="h-4 w-4" aria-hidden />
          {copy.openProfile}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <label className="flex min-w-0 items-center gap-2 text-xs text-foreground-muted">
          <span className="shrink-0">{copy.assignTo}</span>
          <select
            value={row.assignedToId ?? ""}
            onChange={(e) => onAssign(e.target.value || null)}
            className="min-h-9 min-w-0 rounded-lg border border-border bg-surface-muted px-2 text-sm text-foreground"
          >
            <option value="">{copy.unassigned}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </label>
        {row.status === "LOST" ? (
          <button
            type="button"
            onClick={() => onStatus("NEW")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground-muted hover:bg-surface-muted hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {copy.reopen}
          </button>
        ) : (
          row.status !== "ACTIVE" && (
            <button
              type="button"
              onClick={() => onStatus("LOST")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground-muted hover:bg-surface-muted hover:text-danger"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {copy.markLost}
            </button>
          )
        )}
      </div>
    </li>
  );
}

function SeatChip({ tone, label }: { tone: "ok" | "warn" | "bad"; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold",
        tone === "ok" && "bg-success/15 text-success",
        tone === "warn" && "bg-warning/15 text-warning",
        tone === "bad" && "bg-danger/15 text-danger",
      )}
    >
      {label}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
