"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2, Plus, Trash2 } from "lucide-react";
import { SessionEditDrawer } from "@/components/dance/session-edit-drawer";
import { SessionsInstructorGrid } from "@/components/dance/sessions-instructor-grid";
import { SessionsRoomGrid } from "@/components/dance/sessions-room-grid";
import { SessionsWeekGrid } from "@/components/dance/sessions-week-grid";
import { dna } from "@/lib/design/dna";
import {
  createClassSessionAction,
  createCourseAction,
} from "@/lib/actions/class-sessions";
import {
  createSessionSeasonAction,
  deleteSessionSeasonAction,
  publishSessionSeasonAction,
} from "@/lib/actions/session-seasons";
import type { DanceAdminBundle } from "@/lib/data/dance-admin";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type ScheduleView = "rooms" | "days" | "instructors";

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
  const [scheduleView, setScheduleView] = useState<ScheduleView>("rooms");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredClasses = useMemo(() => {
    if (selectedSeasonId === "all") return data.classes;
    return data.classes.filter((c) => c.seasonId === selectedSeasonId);
  }, [data.classes, selectedSeasonId]);

  const selectedClass =
    filteredClasses.find((c) => c.id === selectedClassId) ??
    data.classes.find((c) => c.id === selectedClassId) ??
    null;

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
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              selectedSeasonId === "all"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground-muted hover:text-foreground",
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
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                selectedSeasonId === season.id
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground-muted hover:text-foreground",
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
              className={cn(dna.cta, "text-xs disabled:opacity-60")}
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
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-danger"
            >
              <Trash2 className="h-3 w-3" />
              {d.deleteSeason}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{d.classesTitle}</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">{d.gridHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={dna.pillTrack}>
              {(
                [
                  { id: "rooms" as const, label: d.viewRooms },
                  { id: "days" as const, label: d.viewDays },
                  { id: "instructors" as const, label: d.viewInstructors },
                ] as const
              ).map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setScheduleView(view.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold",
                    scheduleView === view.id ? dna.pillActive : dna.pillIdle,
                  )}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <p className="text-xs tabular-nums text-foreground-muted">
              <span className="font-semibold text-foreground">{filteredClasses.length}</span>{" "}
              {d.classesCount}
            </p>
          </div>
        </div>

        {filteredClasses.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface-muted/40 px-4 py-12 text-center text-sm text-foreground-muted">
            {d.emptyClasses}
          </p>
        ) : scheduleView === "rooms" ? (
          <SessionsRoomGrid
            classes={filteredClasses}
            rooms={data.rooms}
            selectedId={selectedClassId}
            onSelect={(id) => {
              setSelectedClassId(id);
              setDrawerOpen(true);
            }}
            dict={dict}
          />
        ) : scheduleView === "instructors" ? (
          <SessionsInstructorGrid
            classes={filteredClasses}
            instructors={data.instructors}
            selectedId={selectedClassId}
            onSelect={(id) => {
              setSelectedClassId(id);
              setDrawerOpen(true);
            }}
            dict={dict}
          />
        ) : (
          <SessionsWeekGrid
            classes={filteredClasses}
            selectedId={selectedClassId}
            onSelect={(id) => {
              setSelectedClassId(id);
              setDrawerOpen(true);
            }}
            dict={dict}
          />
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
              setDrawerOpen(true);
              setMessage(d.classCreated);
            })
          }
          onError={(code) => setError(d.errors[code as keyof typeof d.errors] ?? d.errors.generic)}
        />
      </section>

      <SessionEditDrawer
        open={drawerOpen && selectedClass != null}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedClassId(null);
        }}
        cls={selectedClass}
        data={data}
        lang={lang}
        dict={dict}
        onDeleted={() => {
          setSelectedClassId(null);
          setMessage(d.classDeleted);
          router.refresh();
        }}
      />
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
        className={cn(dna.field, "sm:col-span-2")}
      />
      <input
        type="date"
        value={startsOn}
        onChange={(e) => setStartsOn(e.target.value)}
        className={dna.field}
      />
      <input
        type="date"
        value={endsOn}
        onChange={(e) => setEndsOn(e.target.value)}
        className={dna.field}
      />
      <button
        type="submit"
        disabled={pending}
        className={cn(dna.cta, "text-xs sm:col-span-4 disabled:opacity-60")}
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
    <div className="space-y-2 rounded-2xl border border-dashed border-border bg-surface/50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-foreground-muted">
        {d.addClass}
      </p>

      {data.courses.length === 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            value={newCourseTitle}
            onChange={(e) => setNewCourseTitle(e.target.value)}
            placeholder={d.courseTitlePlaceholder}
            className={dna.field}
          />
          <input
            value={newCourseStyle}
            onChange={(e) => setNewCourseStyle(e.target.value)}
            placeholder={d.courseStylePlaceholder}
            className={dna.field}
          />
          <select
            value={newCourseLevel}
            onChange={(e) =>
              setNewCourseLevel(e.target.value as "BEGINNER" | "INTERMEDIATE" | "ADVANCED")
            }
            className={dna.field}
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
            className={cn(dna.ctaGhost, "text-xs sm:col-span-3")}
          >
            {d.createCourse}
          </button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className={dna.field}
          disabled={data.courses.length === 0}
        >
          {data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.style})
            </option>
          ))}
        </select>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={dna.field}>
          {data.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          className={dna.field}
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
          className={dna.field}
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
          className={dna.field}
        />
        <input
          type="time"
          value={endLocal}
          onChange={(e) => setEndLocal(e.target.value)}
          className={dna.field}
        />
        <input
          type="number"
          value={maxLeads}
          onChange={(e) => setMaxLeads(e.target.value)}
          placeholder={d.maxLeads}
          className={dna.field}
        />
        <input
          type="number"
          value={maxFollows}
          onChange={(e) => setMaxFollows(e.target.value)}
          placeholder={d.maxFollows}
          className={dna.field}
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={d.priceRegular}
          className={cn(dna.field, "sm:col-span-2")}
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
        className={cn(dna.cta, "w-full text-xs disabled:opacity-60")}
      >
        {(pending || isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {d.createClass}
      </button>
    </div>
  );
}
