"use client";

import { useMemo, useState, useTransition } from "react";
import { BookOpen } from "lucide-react";
import {
  deleteCourseLessonAction,
  upsertCourseLessonAction,
} from "@/lib/actions/course-lessons";
import { dna } from "@/lib/design/dna";
import type { CoursePlanView } from "@/lib/data/course-lessons";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function CoursePlansAdmin({
  lang,
  courses,
  dict,
}: {
  lang: Locale;
  courses: CoursePlanView[];
  dict: Dictionary;
}) {
  const p = dict.plans;
  const [courseId, setCourseId] = useState(courses[0]?.courseId ?? "");
  const selected = useMemo(
    () => courses.find((c) => c.courseId === courseId) ?? courses[0] ?? null,
    [courses, courseId],
  );

  if (courses.length === 0) {
    return (
      <div className={cn(dna.panel, "mx-4 my-6 flex flex-col items-center gap-2 px-4 py-12 text-center sm:mx-6")}>
        <BookOpen className="h-6 w-6 text-foreground-muted" aria-hidden />
        <p className="text-sm font-medium">{p.emptyCourses}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
      <label className="block max-w-lg">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {p.pickCourse}
        </span>
        <select
          value={selected?.courseId ?? ""}
          onChange={(e) => setCourseId(e.target.value)}
          className={cn(dna.field, "min-h-11")}
        >
          {courses.map((c) => (
            <option key={c.courseId} value={c.courseId}>
              {c.title} · {c.style} · {c.level} ({c.lessons.length})
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <>
          <LessonEditor key={`${selected.courseId}-new`} lang={lang} courseId={selected.courseId} dict={dict} />
          {selected.lessons.length === 0 ? (
            <p className="text-sm text-foreground-muted">{p.emptyLessons}</p>
          ) : (
            <ul className="space-y-3">
              {selected.lessons.map((lesson) => (
                <li key={lesson.id} className={cn(dna.panel, "p-4")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                    {p.week} {lesson.weekNumber}
                  </p>
                  <h3 className="mt-1 font-semibold">{lesson.title}</h3>
                  {lesson.body && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">{lesson.body}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-foreground-muted">
                    {lesson.musicNote && (
                      <span>
                        {p.music}: {lesson.musicNote}
                      </span>
                    )}
                    {lesson.leadFocus && (
                      <span>
                        {p.lead}: {lesson.leadFocus}
                      </span>
                    )}
                    {lesson.followFocus && (
                      <span>
                        {p.follow}: {lesson.followFocus}
                      </span>
                    )}
                  </div>
                  <LessonEditor
                    lang={lang}
                    courseId={selected.courseId}
                    dict={dict}
                    existing={lesson}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function LessonEditor({
  lang,
  courseId,
  dict,
  existing,
}: {
  lang: Locale;
  courseId: string;
  dict: Dictionary;
  existing?: CoursePlanView["lessons"][number];
}) {
  const p = dict.plans;
  const [weekNumber, setWeekNumber] = useState(existing?.weekNumber ?? 1);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [musicNote, setMusicNote] = useState(existing?.musicNote ?? "");
  const [leadFocus, setLeadFocus] = useState(existing?.leadFocus ?? "");
  const [followFocus, setFollowFocus] = useState(existing?.followFocus ?? "");
  const [videoUrl, setVideoUrl] = useState(existing?.videoUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className={cn(!existing && dna.panel, "mt-3 grid gap-2 sm:grid-cols-2", !existing && "p-4")}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await upsertCourseLessonAction({
            courseId,
            weekNumber,
            title,
            body,
            musicNote,
            leadFocus,
            followFocus,
            videoUrl,
            lang,
          });
          if (!result.ok) setError(p.saveError);
        });
      }}
    >
      {!existing && <p className="sm:col-span-2 text-sm font-semibold">{p.addWeek}</p>}
      <label className="text-xs font-semibold text-foreground-muted">
        {p.week}
        <input
          type="number"
          min={1}
          max={52}
          value={weekNumber}
          onChange={(e) => setWeekNumber(Number(e.target.value))}
          className={cn(dna.field, "mt-1 min-h-11")}
          disabled={Boolean(existing)}
        />
      </label>
      <label className="text-xs font-semibold text-foreground-muted">
        {p.title}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={cn(dna.field, "mt-1 min-h-11")}
          required
        />
      </label>
      <label className="sm:col-span-2 text-xs font-semibold text-foreground-muted">
        {p.body}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className={cn(dna.field, "mt-1 resize-y")}
        />
      </label>
      <label className="text-xs font-semibold text-foreground-muted">
        {p.music}
        <input value={musicNote} onChange={(e) => setMusicNote(e.target.value)} className={cn(dna.field, "mt-1 min-h-11")} />
      </label>
      <label className="text-xs font-semibold text-foreground-muted">
        {p.video}
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={cn(dna.field, "mt-1 min-h-11")} />
      </label>
      <label className="text-xs font-semibold text-foreground-muted">
        {p.lead}
        <input value={leadFocus} onChange={(e) => setLeadFocus(e.target.value)} className={cn(dna.field, "mt-1 min-h-11")} />
      </label>
      <label className="text-xs font-semibold text-foreground-muted">
        {p.follow}
        <input
          value={followFocus}
          onChange={(e) => setFollowFocus(e.target.value)}
          className={cn(dna.field, "mt-1 min-h-11")}
        />
      </label>
      {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={cn(dna.cta, "min-h-11")}>
          {existing ? p.save : p.addWeek}
        </button>
        {existing && (
          <button
            type="button"
            disabled={pending}
            className={cn(dna.ctaGhost, "min-h-11")}
            onClick={() => {
              start(async () => {
                const result = await deleteCourseLessonAction({ lessonId: existing.id, lang });
                if (!result.ok) setError(p.saveError);
              });
            }}
          >
            {p.delete}
          </button>
        )}
      </div>
    </form>
  );
}
