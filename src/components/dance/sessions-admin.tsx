"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  Check,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  createClassSessionAction,
  createCourseAction,
  deleteClassSessionAction,
} from "@/lib/actions/class-sessions";
import {
  createSessionSeasonAction,
  deleteSessionSeasonAction,
  publishSessionSeasonAction,
} from "@/lib/actions/session-seasons";
import { enrollStudentAction, markAttendanceAction } from "@/lib/actions/enrollments";
import type { DanceAdminBundle, DanceClassRow } from "@/lib/data/dance-admin";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function parityTone(imbalance: number, waitlisted: number): string {
  if (waitlisted > 0 || imbalance > 2) return "bg-danger/15 text-danger";
  if (imbalance >= 1) return "bg-warning/15 text-warning";
  return "bg-success/15 text-success";
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function SessionsAdmin({
  data,
  dict,
  lang,
}: {
  data: DanceAdminBundle;
  dict: Dictionary;
  lang: string;
}) {
  const d = dict.dance;
  const router = useRouter();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | "all">(
    data.seasons.find((s) => s.status === "ACTIVE")?.id ?? data.seasons[0]?.id ?? "all",
  );
  const [selectedClassId, setSelectedClassId] = useState<string | null>(
    data.classes[0]?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredClasses = useMemo(() => {
    if (selectedSeasonId === "all") return data.classes;
    return data.classes.filter((c) => c.seasonId === selectedSeasonId);
  }, [data.classes, selectedSeasonId]);

  const selectedClass: DanceClassRow | null =
    filteredClasses.find((c) => c.id === selectedClassId) ?? filteredClasses[0] ?? null;

  function run(action: () => Promise<void>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        setError(d.errors.generic);
      }
    });
  }

  return (
    <div className="space-y-6">
      {(message || error) && (
        <p className={cn("text-sm", error ? "text-danger" : "text-success")}>{error ?? message}</p>
      )}

      {/* Seasons */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-accent" aria-hidden />
          <h2 className="text-sm font-semibold">{d.seasonsTitle}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedSeasonId("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              selectedSeasonId === "all"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-foreground-muted",
            )}
          >
            {d.allSeasons}
          </button>
          {data.seasons.map((season) => (
            <button
              key={season.id}
              type="button"
              onClick={() => setSelectedSeasonId(season.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                selectedSeasonId === season.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-foreground-muted",
              )}
            >
              {season.name} · {season.status}
              <span className="ml-1 opacity-70">({season.classCount})</span>
            </button>
          ))}
        </div>

        <SeasonCreateForm
          locationId={data.locationId}
          lang={lang}
          dict={dict}
          pending={isPending}
          onSubmit={(payload) =>
            run(async () => {
              const result = await createSessionSeasonAction(payload);
              if (!result.ok) {
                setError(d.errors[result.error as keyof typeof d.errors] ?? d.errors.generic);
                return;
              }
              setMessage(d.seasonCreated);
              setSelectedSeasonId(result.id);
            })
          }
        />

        {selectedSeasonId !== "all" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const result = await publishSessionSeasonAction({
                    seasonId: selectedSeasonId,
                    lang,
                  });
                  if (!result.ok) {
                    setError(d.errors[result.error as keyof typeof d.errors] ?? d.errors.generic);
                    return;
                  }
                  setMessage(d.seasonPublished);
                })
              }
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-60"
            >
              {d.publishSeason}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const result = await deleteSessionSeasonAction({
                    seasonId: selectedSeasonId,
                    lang,
                  });
                  if (!result.ok) {
                    setError(d.errors[result.error as keyof typeof d.errors] ?? d.errors.generic);
                    return;
                  }
                  setMessage(d.seasonDeleted);
                  setSelectedSeasonId("all");
                })
              }
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-danger"
            >
              <Trash2 className="h-3 w-3" />
              {d.deleteSeason}
            </button>
          </div>
        )}
      </section>

      {/* Class grid + create */}
      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{d.classesTitle}</h2>
          {filteredClasses.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface-muted px-4 py-8 text-center text-sm text-foreground-muted">
              {d.emptyClasses}
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredClasses.map((cls) => {
                const active = selectedClass?.id === cls.id;
                return (
                  <li key={cls.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedClassId(cls.id)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        active
                          ? "border-accent bg-accent/5"
                          : "border-border bg-surface hover:bg-surface-muted",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{cls.courseTitle}</p>
                          <p className="mt-0.5 text-xs text-foreground-muted">
                            {cls.courseStyle} · {cls.courseLevel} · {cls.roomName}
                          </p>
                          <p className="mt-1 text-xs text-foreground-muted">
                            {cls.dayOfWeek != null ? d.days[DAY_KEYS[cls.dayOfWeek]] : "—"}{" "}
                            {formatClock(cls.startTime)}–{formatClock(cls.endTime)} ·{" "}
                            {cls.instructorName}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            parityTone(cls.imbalance, cls.waitlistedCount),
                          )}
                        >
                          L{cls.leadsFilled}/{cls.maxLeads} · F{cls.followsFilled}/{cls.maxFollows}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <ClassCreateForm
            data={data}
            seasonId={selectedSeasonId === "all" ? null : selectedSeasonId}
            lang={lang}
            dict={dict}
            pending={isPending}
            onCreated={(id) =>
              run(async () => {
                setSelectedClassId(id);
                setMessage(d.classCreated);
              })
            }
            onError={(code) => setError(d.errors[code as keyof typeof d.errors] ?? d.errors.generic)}
          />
        </div>

        {/* Enrollments */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-sm font-semibold">{d.enrollmentsTitle}</h2>
          </div>
          {!selectedClass ? (
            <p className="rounded-2xl border border-border bg-surface-muted px-4 py-8 text-center text-sm text-foreground-muted">
              {d.selectClass}
            </p>
          ) : (
            <EnrollmentPanel
              cls={selectedClass}
              students={data.students}
              lang={lang}
              dict={dict}
              pending={isPending}
              onMessage={setMessage}
              onError={setError}
              onDeleteClass={() =>
                run(async () => {
                  const result = await deleteClassSessionAction({
                    sessionId: selectedClass.id,
                    lang,
                  });
                  if (!result.ok) {
                    setError(d.errors.generic);
                    return;
                  }
                  setSelectedClassId(null);
                  setMessage(d.classDeleted);
                })
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

function SeasonCreateForm({
  locationId,
  lang,
  dict,
  pending,
  onSubmit,
}: {
  locationId: string;
  lang: string;
  dict: Dictionary;
  pending: boolean;
  onSubmit: (payload: {
    locationId: string;
    name: string;
    startsOn: string;
    endsOn: string;
    publishOn?: string | null;
    lang: string;
  }) => void;
}) {
  const d = dict.dance;
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  return (
    <form
      className="grid gap-2 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !startsOn || !endsOn) return;
        onSubmit({
          locationId,
          name: name.trim(),
          startsOn,
          endsOn,
          lang,
        });
        setName("");
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={d.seasonNamePlaceholder}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
      />
      <input
        type="date"
        value={startsOn}
        onChange={(e) => setStartsOn(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      />
      <input
        type="date"
        value={endsOn}
        onChange={(e) => setEndsOn(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground sm:col-span-4 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        {d.createSeason}
      </button>
    </form>
  );
}

function ClassCreateForm({
  data,
  seasonId,
  lang,
  dict,
  pending,
  onCreated,
  onError,
}: {
  data: DanceAdminBundle;
  seasonId: string | null;
  lang: string;
  dict: Dictionary;
  pending: boolean;
  onCreated: (id: string) => void;
  onError: (code: string) => void;
}) {
  const d = dict.dance;
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? "");
  const [roomId, setRoomId] = useState(data.rooms[0]?.id ?? "");
  const [instructorId, setInstructorId] = useState(data.instructors[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startLocal, setStartLocal] = useState("19:00");
  const [endLocal, setEndLocal] = useState("20:00");
  const [price, setPrice] = useState("180");
  const [maxLeads, setMaxLeads] = useState("12");
  const [maxFollows, setMaxFollows] = useState("12");
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseStyle, setNewCourseStyle] = useState("Salsa");
  const [newCourseLevel, setNewCourseLevel] = useState<"BEGINNER" | "INTERMEDIATE" | "ADVANCED">(
    "BEGINNER",
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toIsoFromLocalTime(time: string): string {
    const [hh, mm] = time.split(":").map(Number);
    const dte = new Date();
    dte.setHours(hh || 0, mm || 0, 0, 0);
    return dte.toISOString();
  }

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {d.addClass}
      </p>

      {data.courses.length === 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            value={newCourseTitle}
            onChange={(e) => setNewCourseTitle(e.target.value)}
            placeholder={d.courseTitlePlaceholder}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <input
            value={newCourseStyle}
            onChange={(e) => setNewCourseStyle(e.target.value)}
            placeholder={d.courseStylePlaceholder}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <select
            value={newCourseLevel}
            onChange={(e) =>
              setNewCourseLevel(e.target.value as "BEGINNER" | "INTERMEDIATE" | "ADVANCED")
            }
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="BEGINNER">{d.levels.BEGINNER}</option>
            <option value="INTERMEDIATE">{d.levels.INTERMEDIATE}</option>
            <option value="ADVANCED">{d.levels.ADVANCED}</option>
          </select>
          <button
            type="button"
            disabled={isPending || !newCourseTitle.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await createCourseAction({
                  lang,
                  organizationId: data.organizationId,
                  title: newCourseTitle.trim(),
                  style: newCourseStyle.trim() || "Salsa",
                  level: newCourseLevel,
                });
                if (!result.ok) {
                  onError(result.error);
                  return;
                }
                setCourseId(result.id);
                router.refresh();
              })
            }
            className="rounded-full border border-border px-3 py-1.5 text-xs sm:col-span-3"
          >
            {d.createCourse}
          </button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          disabled={data.courses.length === 0}
        >
          {data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.style})
            </option>
          ))}
        </select>
        <select
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          {data.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          {data.instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.fullName}
            </option>
          ))}
        </select>
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          {DAY_KEYS.map((key, idx) => (
            <option key={key} value={String(idx)}>
              {d.days[key]}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={startLocal}
          onChange={(e) => setStartLocal(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <input
          type="time"
          value={endLocal}
          onChange={(e) => setEndLocal(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          value={maxLeads}
          onChange={(e) => setMaxLeads(e.target.value)}
          placeholder={d.maxLeads}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          value={maxFollows}
          onChange={(e) => setMaxFollows(e.target.value)}
          placeholder={d.maxFollows}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={d.priceRegular}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
        />
      </div>
      <button
        type="button"
        disabled={pending || isPending || !courseId || !roomId || !instructorId}
        onClick={() =>
          startTransition(async () => {
            const result = await createClassSessionAction({
              lang,
              seasonId,
              courseId,
              roomId,
              instructorId,
              dayOfWeek: Number(dayOfWeek),
              startTime: toIsoFromLocalTime(startLocal),
              endTime: toIsoFromLocalTime(endLocal),
              maxLeads: Number(maxLeads) || 12,
              maxFollows: Number(maxFollows) || 12,
              priceRegular: Number(price) || 0,
            });
            if (!result.ok) {
              onError(result.error);
              return;
            }
            onCreated(result.id);
          })
        }
        className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-60"
      >
        {(pending || isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {d.createClass}
      </button>
    </div>
  );
}

function EnrollmentPanel({
  cls,
  students,
  lang,
  dict,
  pending,
  onMessage,
  onError,
  onDeleteClass,
}: {
  cls: DanceClassRow;
  students: DanceAdminBundle["students"];
  lang: string;
  dict: Dictionary;
  pending: boolean;
  onMessage: (m: string) => void;
  onError: (m: string) => void;
  onDeleteClass: () => void;
}) {
  const d = dict.dance;
  const router = useRouter();
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [role, setRole] = useState<"LEAD" | "FOLLOW" | "SOLO">("LEAD");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{cls.courseTitle}</p>
          <p className="text-xs text-foreground-muted">
            {d.lead}: {cls.leadsFilled}/{cls.maxLeads} · {d.follow}: {cls.followsFilled}/
            {cls.maxFollows}
            {cls.waitlistedCount > 0 && (
              <span className="ml-2 text-warning">
                {cls.waitlistedCount} {d.waitlisted}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onDeleteClass}
          disabled={pending}
          className="text-xs text-danger hover:underline"
        >
          {d.deleteClass}
        </button>
      </div>

      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {cls.enrollments.length === 0 ? (
          <li className="py-4 text-center text-xs text-foreground-muted">{d.emptyEnrollments}</li>
        ) : (
          cls.enrollments.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-2 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{e.studentName}</p>
                <p className="text-foreground-muted">
                  {e.danceRole}
                  {e.waitlisted ? ` · ${d.waitlisted}` : ""}
                  {e.paid ? ` · ${d.paid}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await markAttendanceAction({
                      enrollmentId: e.id,
                      attended: !e.attended,
                      lang,
                    });
                    if (!result.ok) {
                      onError(d.errors.generic);
                      return;
                    }
                    onMessage(e.attended ? d.attendanceCleared : d.attendanceMarked);
                    router.refresh();
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  e.attended ? "bg-success/15 text-success" : "bg-surface-muted text-foreground-muted",
                )}
              >
                {e.attended && <Check className="h-3 w-3" />}
                {e.attended ? d.attended : d.markAttended}
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "LEAD" | "FOLLOW" | "SOLO")}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="LEAD">{d.lead}</option>
          <option value="FOLLOW">{d.follow}</option>
          <option value="SOLO">{d.solo}</option>
        </select>
        <button
          type="button"
          disabled={isPending || !studentId}
          onClick={() =>
            startTransition(async () => {
              const result = await enrollStudentAction({
                sessionId: cls.id,
                studentId,
                danceRole: role,
                lang,
                allowWaitlist: true,
              });
              if (!result.ok) {
                onError(d.errors[result.error as keyof typeof d.errors] ?? d.errors.generic);
                return;
              }
              onMessage(result.waitlisted ? d.enrolledWaitlist : d.enrolled);
              router.refresh();
            })
          }
          className="inline-flex items-center justify-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground sm:col-span-3 disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {d.enrollStudent}
        </button>
      </div>
    </div>
  );
}
