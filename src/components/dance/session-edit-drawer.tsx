"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Loader2, Trash2, X } from "lucide-react";
import { closeButtonClass, overlayClass, sheetContentClass } from "@/components/ui/modal-chrome";
import { dna } from "@/lib/design/dna";
import {
  deleteClassSessionAction,
  updateClassSessionAction,
} from "@/lib/actions/class-sessions";
import { enrollStudentAction, markAttendanceAction } from "@/lib/actions/enrollments";
import type { DanceAdminBundle, DanceClassRow } from "@/lib/data/dance-admin";
import {
  findSessionConflicts,
  hasInstructorConflict,
  hasRoomConflict,
} from "@/lib/dance/session-conflicts";
import { styleColors } from "@/lib/dance/style-colors";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function SessionEditDrawer({
  open,
  onOpenChange,
  cls,
  data,
  lang,
  dict,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cls: DanceClassRow | null;
  data: DanceAdminBundle;
  lang: string;
  dict: Dictionary;
  onDeleted: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={cn(sheetContentClass, "border-border bg-surface")}>
          {cls && (
            <SessionDrawerBody
              key={cls.id}
              cls={cls}
              data={data}
              lang={lang}
              dict={dict}
              onClose={() => onOpenChange(false)}
              onDeleted={onDeleted}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SessionDrawerBody({
  cls,
  data,
  lang,
  dict,
  onClose,
  onDeleted,
}: {
  cls: DanceClassRow;
  data: DanceAdminBundle;
  lang: string;
  dict: Dictionary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const d = dict.dance;
  const router = useRouter();
  const colors = styleColors(cls.courseStyle);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conflicts = useMemo(() => findSessionConflicts(data.classes), [data.classes]);
  const instructorClash = hasInstructorConflict(conflicts, cls.id);
  const roomClash = hasRoomConflict(conflicts, cls.id);

  const [instructorId, setInstructorId] = useState(cls.instructorId);
  const [roomId, setRoomId] = useState(cls.roomId);
  const [maxLeads, setMaxLeads] = useState(String(cls.maxLeads));
  const [maxFollows, setMaxFollows] = useState(String(cls.maxFollows));
  const [priceRegular, setPriceRegular] = useState(String(cls.priceRegular));
  const [priceCouple, setPriceCouple] = useState(
    cls.priceCouple != null ? String(cls.priceCouple) : "",
  );
  const [priceStudent, setPriceStudent] = useState(
    cls.priceStudent != null ? String(cls.priceStudent) : "",
  );

  const [studentId, setStudentId] = useState(data.students[0]?.id ?? "");
  const [role, setRole] = useState<"LEAD" | "FOLLOW" | "SOLO">("LEAD");

  useEffect(() => {
    setInstructorId(cls.instructorId);
    setRoomId(cls.roomId);
    setMaxLeads(String(cls.maxLeads));
    setMaxFollows(String(cls.maxFollows));
    setPriceRegular(String(cls.priceRegular));
    setPriceCouple(cls.priceCouple != null ? String(cls.priceCouple) : "");
    setPriceStudent(cls.priceStudent != null ? String(cls.priceStudent) : "");
    setMessage(null);
    setError(null);
  }, [cls]);

  function save() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateClassSessionAction({
        lang,
        sessionId: cls.id,
        instructorId,
        roomId,
        maxLeads: Number(maxLeads) || 0,
        maxFollows: Number(maxFollows) || 0,
        priceRegular: Number(priceRegular) || 0,
        priceCouple: priceCouple.trim() === "" ? null : Number(priceCouple),
        priceStudent: priceStudent.trim() === "" ? null : Number(priceStudent),
      });
      if (!result.ok) {
        setError(d.errors[result.error as keyof typeof d.errors] ?? d.errors.generic);
        return;
      }
      setMessage(d.classUpdated);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="min-w-0">
          <div
            className="mb-2 h-1 w-16 rounded-full"
            style={{ background: colors.accent }}
            aria-hidden
          />
          <Dialog.Title className="text-lg font-bold tracking-tight">{cls.courseTitle}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-foreground-muted">
            {cls.courseStyle} · {cls.courseLevel}
            {" · "}
            {cls.dayOfWeek != null ? d.days[DAY_KEYS[cls.dayOfWeek]] : d.gridOneOff}{" "}
            {formatClock(cls.startTime)}–{formatClock(cls.endTime)}
          </Dialog.Description>
        </div>
        <Dialog.Close className={closeButtonClass} aria-label={d.closeDrawer}>
          <X className="h-4 w-4" />
        </Dialog.Close>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {(message || error) && (
          <p className={cn("text-sm", error ? "text-danger" : "text-success")}>
            {error ?? message}
          </p>
        )}

        {(instructorClash || roomClash) && (
          <div className="rounded-xl border border-margin-alert/30 bg-margin-alert/10 px-3 py-2 text-xs font-medium text-margin-alert">
            {instructorClash && <p>{d.conflictInstructorDetail}</p>}
            {roomClash && <p>{d.conflictRoomDetail}</p>}
          </div>
        )}

        <Link
          href={`/${lang}/accueil`}
          className={cn(dna.ctaGhost, "w-full text-sm")}
        >
          <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden />
          {d.openAccueilRoster}
        </Link>

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground-muted">
            {d.editClass}
          </h3>
          <label className="block space-y-1 text-xs font-medium text-foreground-muted">
            {d.instructorLabel}
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
          </label>
          <label className="block space-y-1 text-xs font-medium text-foreground-muted">
            {d.roomLabel}
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={dna.field}>
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-xs font-medium text-foreground-muted">
              {d.maxLeads}
              <input
                type="number"
                min={0}
                value={maxLeads}
                onChange={(e) => setMaxLeads(e.target.value)}
                className={dna.field}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-foreground-muted">
              {d.maxFollows}
              <input
                type="number"
                min={0}
                value={maxFollows}
                onChange={(e) => setMaxFollows(e.target.value)}
                className={dna.field}
              />
            </label>
          </div>
          <div className="grid gap-2">
            <label className="block space-y-1 text-xs font-medium text-foreground-muted">
              {d.priceRegular}
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceRegular}
                onChange={(e) => setPriceRegular(e.target.value)}
                className={dna.field}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-foreground-muted">
              {d.priceCouple}
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceCouple}
                onChange={(e) => setPriceCouple(e.target.value)}
                placeholder="—"
                className={dna.field}
              />
            </label>
            <label className="block space-y-1 text-xs font-medium text-foreground-muted">
              {d.priceStudent}
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceStudent}
                onChange={(e) => setPriceStudent(e.target.value)}
                placeholder="—"
                className={dna.field}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className={cn(dna.cta, "w-full disabled:opacity-60")}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {d.saveClass}
          </button>
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground-muted">
            {d.enrollmentsTitle}
          </h3>
          <p className="text-xs text-foreground-muted">
            <span className="text-role-lead">
              {d.lead}: {cls.leadsFilled}/{cls.maxLeads}
            </span>
            {" · "}
            <span className="text-role-follow">
              {d.follow}: {cls.followsFilled}/{cls.maxFollows}
            </span>
            {cls.waitlistedCount > 0 && (
              <span className="ml-2 text-warning">
                {cls.waitlistedCount} {d.waitlisted}
              </span>
            )}
          </p>

          <ul className="max-h-52 space-y-1.5 overflow-y-auto">
            {cls.enrollments.length === 0 ? (
              <li className="py-4 text-center text-xs text-foreground-muted">{d.emptyEnrollments}</li>
            ) : (
              cls.enrollments.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.studentName}</p>
                    <p className="text-foreground-muted">
                      {e.danceRole === "LEAD"
                        ? d.lead
                        : e.danceRole === "FOLLOW"
                          ? d.follow
                          : d.solo}
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
                          setError(d.errors.generic);
                          return;
                        }
                        setMessage(e.attended ? d.attendanceCleared : d.attendanceMarked);
                        router.refresh();
                      })
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold",
                      e.attended ? "bg-yield/15 text-yield" : "bg-surface-muted text-foreground-muted",
                    )}
                  >
                    {e.attended && <Check className="h-3 w-3" />}
                    {e.attended ? d.attended : d.markAttended}
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="grid gap-2 border-t border-border pt-3">
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={dna.field}
            >
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "LEAD" | "FOLLOW" | "SOLO")}
              className={dna.field}
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
                    setError(d.errors[result.error as keyof typeof d.errors] ?? d.errors.generic);
                    return;
                  }
                  setMessage(result.waitlisted ? d.enrolledWaitlist : d.enrolled);
                  router.refresh();
                })
              }
              className={cn(dna.cta, "w-full disabled:opacity-60")}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {d.enrollStudent}
            </button>
          </div>
        </section>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteClassSessionAction({ sessionId: cls.id, lang });
              if (!result.ok) {
                setError(d.errors.generic);
                return;
              }
              onDeleted();
              onClose();
            })
          }
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger hover:underline disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {d.deleteClass}
        </button>
        <button type="button" onClick={onClose} className={dna.ctaGhost}>
          {d.closeDrawer}
        </button>
      </footer>
    </div>
  );
}
