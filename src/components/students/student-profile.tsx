"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { addStudentNoteAction } from "@/lib/actions/student-notes";
import { inviteReadyStudentAction } from "@/lib/actions/progression";
import { dna } from "@/lib/design/dna";
import type { CrmStudentProfile } from "@/lib/data/students-crm";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

function money(value: number, lang: Locale) {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-ES" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDay(iso: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : lang === "es" ? "es" : "fr-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function StudentProfile({
  lang,
  profile,
  dict,
}: {
  lang: Locale;
  profile: CrmStudentProfile;
  dict: Dictionary;
}) {
  const c = dict.crm;
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-5 sm:px-6">
      <div>
        <Link href={`/${lang}/students`} className={cn(dna.ctaGhost, "min-h-11 w-fit")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {c.back}
        </Link>
        <h1 className="display-title mt-4 text-2xl font-bold tracking-tight">{profile.fullName}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {profile.email}
          {profile.phone ? ` · ${profile.phone}` : ` · ${c.noPhone}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={c.classes} value={String(profile.enrollmentCount)} />
        <Stat label={c.lifetime} value={money(profile.lifetimeCad, lang)} />
        <Stat label={c.unpaid} value={String(profile.unpaidCount)} warn={profile.unpaidCount > 0} />
        <Stat label={c.lastSeen} value={formatDay(profile.lastEnrolledAt, lang)} />
      </dl>

      <section className={cn(dna.panel, "overflow-hidden")}>
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{c.journey}</h2>
        {profile.journey.length === 0 ? (
          <p className="px-4 py-6 text-sm text-foreground-muted">{c.journeyEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {profile.journey.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    {j.style} · {j.level} · {j.courseTitle}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {j.seasonName} · {j.attendedCount}/{j.expectedWeeks} · {j.status}
                    {j.danceRole ? ` · ${j.danceRole}` : ""}
                  </p>
                </div>
                {j.status === "READY_TO_ADVANCE" && (
                  <button
                    type="button"
                    data-interactive
                    className={cn(dna.cta, "min-h-11 text-xs")}
                    onClick={() => {
                      start(async () => {
                        const result = await inviteReadyStudentAction({
                          progressionId: j.id,
                          lang,
                        });
                        if (!result.ok) setError(c.inviteError);
                      });
                    }}
                  >
                    {j.inviteSentAt ? c.inviteSent : c.inviteNext}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(dna.panel, "p-4 sm:p-5")}>
        <h2 className="text-sm font-semibold">{c.notes}</h2>
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const result = await addStudentNoteAction({
                studentId: profile.studentId,
                body,
                lang,
              });
              if (!result.ok) {
                setError(c.noteError);
                return;
              }
              setBody("");
            });
          }}
        >
          <label className="sr-only" htmlFor="student-note">
            {c.notePlaceholder}
          </label>
          <textarea
            id="student-note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={c.notePlaceholder}
            rows={3}
            className={cn(dna.field, "min-h-[5.5rem] resize-y")}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending || !body.trim()} className={cn(dna.cta, "min-h-11 w-fit")}>
            {c.addNote}
          </button>
        </form>
        {profile.notes.length === 0 ? (
          <p className="mt-4 text-sm text-foreground-muted">{c.noNotes}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {profile.notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-surface-muted px-3 py-2.5">
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-xs text-foreground-muted">
                  {n.authorName} · {formatDay(n.createdAt, lang)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(dna.panel, "overflow-hidden")}>
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{c.history}</h2>
        {profile.history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-foreground-muted">{c.noHistory}</p>
        ) : (
          <ul className="divide-y divide-border">
            {profile.history.map((h) => (
              <li key={h.enrollmentId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{h.courseTitle}</p>
                  <p className="text-xs text-foreground-muted">
                    {h.style}
                    {h.seasonName ? ` · ${h.seasonName}` : ""} · {h.danceRole} ·{" "}
                    {formatDay(h.createdAt, lang)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                  {h.waitlisted && (
                    <span className="rounded-lg bg-surface-muted px-2 py-1">{c.waitlisted}</span>
                  )}
                  {!h.waitlisted && !h.paid && (
                    <span className="rounded-lg bg-warning/15 px-2 py-1 text-warning">{c.pending}</span>
                  )}
                  {h.paid && <span className="rounded-lg bg-yield/15 px-2 py-1 text-yield">{c.paid}</span>}
                  {h.amountCad != null && (
                    <span className="tabular-nums text-foreground-muted">{money(h.amountCad, lang)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn(dna.panel, "px-3 py-3")}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className={cn("mt-1 text-lg font-semibold tabular-nums", warn && "text-warning")}>{value}</dd>
    </div>
  );
}
