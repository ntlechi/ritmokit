"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { CheckInRow } from "@/components/accueil/check-in-row";
import { ClassTimeline } from "@/components/accueil/class-timeline";
import { RoleMeters } from "@/components/accueil/role-meters";
import { dna } from "@/lib/design/dna";
import { markAttendanceAction } from "@/lib/actions/enrollments";
import type { AccueilClassCard, AccueilRoster, AccueilRosterRow } from "@/lib/data/accueil-roster";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "unpaid" | "waitlist" | "pending";

function pickDefaultSession(classes: AccueilClassCard[]): string | null {
  if (classes.length === 0) return null;
  const live = classes.find((c) => c.status === "live");
  if (live) return live.sessionId;
  const upcoming = classes.find((c) => c.status === "upcoming");
  if (upcoming) return upcoming.sessionId;
  return classes[0]?.sessionId ?? null;
}

function applyOptimistic(
  classes: AccueilClassCard[],
  enrollmentId: string,
  attended: boolean,
): AccueilClassCard[] {
  return classes.map((cls) => {
    const idx = cls.roster.findIndex((r) => r.enrollmentId === enrollmentId);
    if (idx < 0) return cls;
    const row = cls.roster[idx]!;
    if (row.waitlisted || row.attended === attended) return cls;

    const roster = cls.roster.slice();
    roster[idx] = { ...row, attended };

    let leadsPresent = cls.leads.present;
    let followsPresent = cls.follows.present;
    let notCheckedInCount = cls.notCheckedInCount;

    if (row.danceRole === "LEAD") {
      leadsPresent += attended ? 1 : -1;
    } else if (row.danceRole === "FOLLOW") {
      followsPresent += attended ? 1 : -1;
    }
    notCheckedInCount += attended ? -1 : 1;

    return {
      ...cls,
      roster,
      notCheckedInCount: Math.max(0, notCheckedInCount),
      leads: { ...cls.leads, present: Math.max(0, leadsPresent) },
      follows: { ...cls.follows, present: Math.max(0, followsPresent) },
    };
  });
}

function filterRows(rows: AccueilRosterRow[], filter: FilterKey): AccueilRosterRow[] {
  switch (filter) {
    case "unpaid":
      return rows.filter((r) => !r.waitlisted && !r.paid);
    case "waitlist":
      return rows.filter((r) => r.waitlisted);
    case "pending":
      return rows.filter((r) => !r.waitlisted && !r.attended);
    default:
      return rows;
  }
}

export function AccueilRosterView({
  initial,
  lang,
  dict,
}: {
  initial: AccueilRoster;
  lang: Locale;
  dict: Dictionary;
}) {
  const router = useRouter();
  const a = dict.accueil;
  const [classes, setClasses] = useState(initial.classes);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    pickDefaultSession(initial.classes),
  );
  const [filter, setFilter] = useState<FilterKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    setClasses(initial.classes);
    setSelectedId((prev) => {
      if (prev && initial.classes.some((c) => c.sessionId === prev)) return prev;
      return pickDefaultSession(initial.classes);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional resync on server snapshot
  }, [initial.generatedAt]);

  const selected = useMemo(
    () => classes.find((c) => c.sessionId === selectedId) ?? classes[0] ?? null,
    [classes, selectedId],
  );

  const totalToCheckIn = classes.reduce((sum, c) => sum + c.notCheckedInCount, 0);
  const hasLive = classes.some((c) => c.status === "live");

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: a.filterAll },
    { key: "pending", label: a.filterPending },
    { key: "unpaid", label: a.filterUnpaid },
    { key: "waitlist", label: a.filterWaitlist },
  ];

  async function onToggle(enrollmentId: string, nextAttended: boolean) {
    setError(null);
    const snapshot = classes;
    setClasses((prev) => applyOptimistic(prev, enrollmentId, nextAttended));
    setBusyId(enrollmentId);
    try {
      const result = await markAttendanceAction({
        enrollmentId,
        attended: nextAttended,
        lang,
      });
      if (!result.ok) {
        setClasses(snapshot);
        setError(result.error === "waitlisted" ? a.waitlisted : dict.dance.errors.generic);
        return;
      }
      router.refresh();
    } catch {
      setClasses(snapshot);
      setError(dict.dance.errors.generic);
    } finally {
      setBusyId(null);
    }
  }

  if (classes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-20 text-center">
        <ClipboardCheck className="h-10 w-10 text-foreground-muted" aria-hidden />
        <p className="max-w-sm text-sm text-foreground-muted">{a.empty}</p>
      </div>
    );
  }

  const activeRows = selected
    ? filterRows(
        selected.roster.filter((r) => !r.waitlisted),
        filter === "waitlist" ? "all" : filter,
      )
    : [];
  const waitlistRows = selected
    ? filter === "unpaid" || filter === "pending"
      ? []
      : filterRows(
          selected.roster.filter((r) => r.waitlisted),
          filter === "waitlist" ? "waitlist" : "all",
        )
    : [];

  const showEmpty =
    selected &&
    activeRows.length === 0 &&
    waitlistRows.length === 0 &&
    filter !== "all";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground-muted">
              {initial.locationName} · {initial.date}
            </p>
            {hasLive && (
              <span className={cn(dna.liveBadge)}>
                <span className="live-pulse" aria-hidden />
                {a.live}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            <span className="font-semibold tabular-nums text-foreground">{classes.length}</span>{" "}
            {a.classesToday}
            {totalToCheckIn > 0 && (
              <>
                {" · "}
                <span className="font-semibold tabular-nums text-accent">{totalToCheckIn}</span>{" "}
                {a.toCheckIn}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          data-interactive
          disabled={isRefreshing}
          onClick={() =>
            startRefresh(() => {
              router.refresh();
            })
          }
          className={cn(dna.ctaGhost, "min-h-11")}
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} aria-hidden />
          {a.refresh}
        </button>
      </div>

      <ClassTimeline
        classes={classes}
        selectedId={selected?.sessionId ?? null}
        onSelect={setSelectedId}
        dict={a}
      />

      {selected && (
        <article className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
          <div
            className="h-1.5"
            style={{ backgroundColor: selected.roomColorHex }}
            aria-hidden
          />
          <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
                    {selected.courseTitle}
                  </h2>
                  <StatusPill status={selected.status} dict={a} />
                </div>
                <p className="mt-1 text-sm text-foreground-muted">
                  {selected.startLabel}–{selected.endLabel} · {selected.roomName} ·{" "}
                  {selected.style} · {selected.level}
                </p>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  {a.instructor}: {selected.instructorName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
                {selected.unpaidCount > 0 && (
                  <span className="rounded-lg bg-warning/15 px-2.5 py-1 text-warning">
                    {selected.unpaidCount} {a.badgePending}
                  </span>
                )}
                {selected.waitlistedCount > 0 && (
                  <span className="rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-foreground-muted">
                    {selected.waitlistedCount} {a.badgeWaitlist}
                  </span>
                )}
                <span className="rounded-lg bg-yield/15 px-2.5 py-1 tabular-nums text-yield">
                  {selected.leads.present + selected.follows.present} {a.present}
                </span>
              </div>
            </div>

            <RoleMeters
              leadsFilled={selected.leads.filled}
              leadsMax={selected.leads.max}
              leadsPresent={selected.leads.present}
              followsFilled={selected.follows.filled}
              followsMax={selected.follows.max}
              followsPresent={selected.follows.present}
              leadsLabel={a.leads}
              followsLabel={a.follows}
              presentLabel={a.present}
            />

            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={a.filterAll}>
              {filters.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  data-interactive
                  onClick={() => setFilter(key)}
                  className={cn(
                    "min-h-10 rounded-xl px-3.5 text-xs font-bold transition sm:min-h-11 sm:text-sm",
                    filter === key
                      ? "bg-accent text-accent-foreground shadow-xs"
                      : "bg-surface-muted text-foreground-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            {showEmpty ? (
              <p className="py-10 text-center text-sm text-foreground-muted">{a.noMatch}</p>
            ) : (
              <div className="space-y-6">
                {(filter === "all" || filter === "pending" || filter === "unpaid") &&
                  activeRows.length > 0 && (
                    <section>
                      {filter === "all" && (
                        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground-muted">
                          {a.activeSection}
                        </h3>
                      )}
                      <ul className="space-y-2.5">
                        {activeRows.map((row) => (
                          <CheckInRow
                            key={row.enrollmentId}
                            row={row}
                            dict={a}
                            busy={busyId === row.enrollmentId}
                            onToggle={onToggle}
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                {waitlistRows.length > 0 && (
                  <section>
                    <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground-muted">
                      {a.waitlistSection}
                    </h3>
                    <ul className="space-y-2.5">
                      {waitlistRows.map((row) => (
                        <CheckInRow
                          key={row.enrollmentId}
                          row={row}
                          dict={a}
                          busy={false}
                          onToggle={onToggle}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </article>
      )}
    </div>
  );
}

function StatusPill({
  status,
  dict,
}: {
  status: AccueilClassCard["status"];
  dict: Dictionary["accueil"];
}) {
  const label =
    status === "live" ? dict.live : status === "done" ? dict.done : dict.upcoming;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        status === "live" && "border border-live/30 bg-live/10 text-live",
        status === "upcoming" && "bg-accent/10 text-accent",
        status === "done" && "bg-surface-muted text-foreground-muted",
      )}
    >
      {status === "live" && <span className="live-pulse" aria-hidden />}
      {label}
    </span>
  );
}
