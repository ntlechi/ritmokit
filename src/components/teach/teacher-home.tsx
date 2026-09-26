"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Music, NotebookPen, Sparkles } from "lucide-react";
import { applyOptimistic } from "@/components/accueil/accueil-roster";
import { CheckInRow } from "@/components/accueil/check-in-row";
import { RoleMeters } from "@/components/accueil/role-meters";
import { CapacityPill } from "@/components/dance/capacity-pill";
import { ClassCard } from "@/components/dance/class-card";
import { ClassStatusChip } from "@/components/dance/class-status-chip";
import { RoleBalanceBar } from "@/components/dance/role-balance-bar";
import { markAttendanceAction } from "@/lib/actions/enrollments";
import { addStudentNoteAction } from "@/lib/actions/student-notes";
import type { AccueilClassCard } from "@/lib/data/accueil-roster";
import type { TeacherDay, TeacherUpcomingClass } from "@/lib/data/teacher-day";
import { dna } from "@/lib/design/dna";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function TeacherHome({
  lang,
  dict,
  day,
}: {
  lang: Locale;
  dict: Dictionary;
  day: TeacherDay;
}) {
  const copy = dict.studioOps.teach;
  const classes = day.tonight?.classes ?? [];

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-4 sm:px-6 sm:py-5">
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground-muted">
          {copy.tonight}
        </h2>
        {classes.length === 0 ? (
          <div className={cn(dna.panel, "px-6 py-10 text-center text-sm text-foreground-muted")}>
            {copy.emptyTonight}
          </div>
        ) : (
          // Remount on each server snapshot so the optimistic state never goes stale.
          <TonightClasses
            key={day.tonight?.generatedAt}
            initial={classes}
            lang={lang}
            dict={dict}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground-muted">
          {copy.nextDays}
        </h2>
        <UpcomingList upcoming={day.upcoming} lang={lang} dict={dict} />
      </section>
    </div>
  );
}

function TonightClasses({
  initial,
  lang,
  dict,
}: {
  initial: AccueilClassCard[];
  lang: Locale;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Set<string>>(new Set());

  async function onToggle(enrollmentId: string, nextAttended: boolean) {
    if (inflight.current.has(enrollmentId)) return;
    inflight.current.add(enrollmentId);
    setError(null);
    setBusyId(enrollmentId);
    setClasses((prev) => applyOptimistic(prev, enrollmentId, nextAttended));
    const rollback = () => setClasses((prev) => applyOptimistic(prev, enrollmentId, !nextAttended));
    try {
      const res = await markAttendanceAction({ enrollmentId, attended: nextAttended, lang });
      if (!res.ok) {
        rollback();
        setError(res.error === "waitlisted" ? dict.accueil.waitlisted : dict.dance.errors.generic);
        return;
      }
      router.refresh();
    } catch {
      rollback();
      setError(dict.dance.errors.generic);
    } finally {
      inflight.current.delete(enrollmentId);
      setBusyId((cur) => (cur === enrollmentId ? null : cur));
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {classes.map((cls) => (
        <TonightClass
          key={cls.sessionId}
          cls={cls}
          lang={lang}
          dict={dict}
          busyId={busyId}
          onToggle={onToggle}
          onEvaluated={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function TonightClass({
  cls,
  lang,
  dict,
  busyId,
  onToggle,
  onEvaluated,
}: {
  cls: AccueilClassCard;
  lang: Locale;
  dict: Dictionary;
  busyId: string | null;
  onToggle: (enrollmentId: string, next: boolean) => void;
  onEvaluated: () => void;
}) {
  const copy = dict.studioOps.teach;
  const cardCopy = dict.studioOps.classCard;
  const seated = cls.roster.filter((r) => !r.waitlisted);
  const waitlist = cls.roster.filter((r) => r.waitlisted);
  const newCount = seated.filter((r) => r.firstVisit).length;
  const plan = cls.tonightPlan;
  const capacity = cls.leads.max + cls.follows.max;

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
      <div className="h-1.5" style={{ backgroundColor: cls.roomColorHex }} aria-hidden />
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
                {cls.courseTitle}
              </h3>
              <ClassStatusChip status={cls.status} copy={cardCopy} />
            </div>
            <p className="mt-1 text-sm text-foreground-muted">
              {cls.startLabel}–{cls.endLabel} · {cls.roomName} · {cls.style} ·{" "}
              {dict.dance.levels[cls.level as keyof typeof dict.dance.levels] ?? cls.level}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CapacityPill
                booked={seated.length}
                capacity={capacity}
                label={cardCopy.seats}
                fullLabel={cardCopy.full}
              />
              {cls.waitlistedCount > 0 && (
                <span className="rounded-full bg-margin-alert/15 px-2 py-0.5 text-[11px] font-bold text-margin-alert">
                  {cardCopy.waitlist.replace("{n}", String(cls.waitlistedCount))}
                </span>
              )}
            </div>
          </div>

          <LessonPanel plan={plan} planWeek={cls.planWeek} lang={lang} dict={dict} isSocial={cls.isSocial} />

          {!cls.isSocial && (
            <>
              <RoleBalanceBar
                leads={cls.leads.filled}
                follows={cls.follows.filled}
                maxImbalance={cls.maxImbalance}
                copy={cardCopy}
              />
              <RoleMeters
                leadsFilled={cls.leads.filled}
                leadsMax={cls.leads.max}
                leadsPresent={cls.leads.present}
                followsFilled={cls.follows.filled}
                followsMax={cls.follows.max}
                followsPresent={cls.follows.present}
                leadsLabel={dict.accueil.leads}
                followsLabel={dict.accueil.follows}
                presentLabel={dict.accueil.present}
              />
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground-muted">
              {copy.roster} · <span className="tabular-nums">{cls.presentCount}/{seated.length}</span>{" "}
              {copy.present}
            </h4>
            {newCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {copy.newStudentsTonight.replace("{n}", String(newCount))}
              </span>
            )}
          </div>

          {seated.length === 0 && waitlist.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground-muted">{copy.rosterEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {[...seated]
                .sort((a, b) => Number(b.firstVisit) - Number(a.firstVisit))
                .map((row) => (
                  <CheckInRow
                    key={row.enrollmentId}
                    row={row}
                    dict={dict.accueil}
                    lang={lang}
                    busy={busyId === row.enrollmentId}
                    onToggle={onToggle}
                    onEvaluated={onEvaluated}
                    firstVisitLabel={dict.studioOps.intake.firstClass}
                  />
                ))}
              {waitlist.map((row) => (
                <CheckInRow
                  key={row.enrollmentId}
                  row={row}
                  dict={dict.accueil}
                  lang={lang}
                  busy={false}
                  onToggle={onToggle}
                  firstVisitLabel={dict.studioOps.intake.firstClass}
                />
              ))}
            </ul>
          )}

          <ClassNotes
            students={seated.map((r) => ({ id: r.studentId, name: r.studentName }))}
            lang={lang}
            copy={copy}
          />
        </div>
      </div>
    </article>
  );
}

function LessonPanel({
  plan,
  planWeek,
  lang,
  dict,
  isSocial,
}: {
  plan: AccueilClassCard["tonightPlan"];
  planWeek: number;
  lang: Locale;
  dict: Dictionary;
  isSocial: boolean;
}) {
  const copy = dict.studioOps.teach;
  if (isSocial && !plan) return null;
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          {copy.lessonTitle} · {copy.week.replace("{n}", String(plan?.weekNumber ?? planWeek))}
        </p>
        <Link
          href={`/${lang}/plans`}
          className="text-xs font-semibold text-foreground-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          {copy.openPlans}
        </Link>
      </div>
      {plan ? (
        <>
          <p className="mt-2 text-lg font-semibold leading-snug">{plan.title}</p>
          {plan.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground-muted">{plan.body}</p>
          )}
          {(plan.leadFocus || plan.followFocus || plan.musicNote) && (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {plan.leadFocus && (
                <div className="rounded-xl bg-role-lead/10 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-role-lead">
                    {copy.leadFocus}
                  </dt>
                  <dd className="mt-0.5">{plan.leadFocus}</dd>
                </div>
              )}
              {plan.followFocus && (
                <div className="rounded-xl bg-role-follow/10 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-role-follow">
                    {copy.followFocus}
                  </dt>
                  <dd className="mt-0.5">{plan.followFocus}</dd>
                </div>
              )}
              {plan.musicNote && (
                <div className="rounded-xl bg-surface-muted px-3 py-2 sm:col-span-2">
                  <dt className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-foreground-muted">
                    <Music className="h-3 w-3" aria-hidden />
                    {copy.music}
                  </dt>
                  <dd className="mt-0.5">{plan.musicNote}</dd>
                </div>
              )}
            </dl>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-foreground-muted">{copy.lessonEmpty}</p>
      )}
    </div>
  );
}

function ClassNotes({
  students,
  lang,
  copy,
}: {
  students: { id: string; name: string }[];
  lang: Locale;
  copy: Dictionary["studioOps"]["teach"];
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  if (students.length === 0) return null;

  async function save() {
    if (!studentId || !body.trim()) return;
    setState("saving");
    const res = await addStudentNoteAction({ studentId, body: body.trim(), lang });
    if (res.ok) {
      setBody("");
      setState("saved");
    } else {
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-muted/40 p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-foreground-muted">
        <NotebookPen className="h-3.5 w-3.5" aria-hidden />
        {copy.notesTitle}
      </p>
      <label className="mt-3 block text-xs font-medium text-foreground-muted">
        {copy.notesStudent}
        <select
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            setState("idle");
          }}
          className={cn(dna.field, "mt-1")}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (state !== "saving") setState("idle");
        }}
        placeholder={copy.notesPlaceholder}
        rows={3}
        maxLength={2000}
        className={cn(dna.field, "mt-2 resize-y")}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p
          className={cn("text-xs", state === "error" ? "text-danger" : "text-success")}
          role="status"
        >
          {state === "saved" ? copy.notesSaved : state === "error" ? copy.notesError : ""}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={state === "saving" || !body.trim()}
          className={cn(dna.cta, "disabled:opacity-50")}
        >
          {copy.notesSave}
        </button>
      </div>
    </div>
  );
}

function UpcomingList({
  upcoming,
  lang,
  dict,
}: {
  upcoming: TeacherUpcomingClass[];
  lang: Locale;
  dict: Dictionary;
}) {
  const copy = dict.studioOps.teach;
  if (upcoming.length === 0) {
    return (
      <div className={cn(dna.panel, "px-6 py-8 text-center text-sm text-foreground-muted")}>
        {copy.emptyNextDays}
      </div>
    );
  }

  const byDate = new Map<string, TeacherUpcomingClass[]>();
  for (const cls of upcoming) {
    const list = byDate.get(cls.date) ?? [];
    list.push(cls);
    byDate.set(cls.date, list);
  }

  return (
    <div className="space-y-4">
      {[...byDate.entries()].map(([date, list]) => (
        <div key={date}>
          <p className="mb-2 text-sm font-semibold capitalize">
            {new Intl.DateTimeFormat(lang, {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(new Date(`${date}T12:00:00Z`))}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((cls) => (
              <li key={cls.key} className="space-y-1.5">
                <ClassCard
                  copy={dict.studioOps.classCard}
                  data={{
                    id: cls.key,
                    title: cls.courseTitle,
                    style: cls.style,
                    levelLabel:
                      dict.dance.levels[cls.level as keyof typeof dict.dance.levels] ?? cls.level,
                    startLabel: cls.startLabel,
                    endLabel: cls.endLabel,
                    roomName: cls.roomName,
                    instructorName: null,
                    leads: cls.leads,
                    follows: cls.follows,
                    booked: cls.booked,
                    capacity: cls.capacity,
                    waitlisted: cls.waitlisted,
                    newStudents: cls.newStudents,
                    maxImbalance: cls.maxImbalance,
                    isSocial: cls.isSocial,
                  }}
                />
                <p className="flex items-start gap-1.5 px-1 text-xs text-foreground-muted">
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold text-foreground">
                      {copy.week.replace("{n}", String(cls.lessonWeek))}
                    </span>
                    {" · "}
                    {cls.lessonTitle ?? copy.lessonEmpty}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}