"use client";

import { useState, useTransition } from "react";
import { FileSignature } from "lucide-react";
import { signDisciplinaryRecordAction } from "@/lib/actions/workplace-convention";
import type { DisciplineRecordEntry } from "@/lib/data/workplace-convention";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { DisciplineStep } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function stepLabel(dict: Dictionary, step: DisciplineStep) {
  const map: Record<DisciplineStep, string> = {
    VERBAL_COACHING: dict.convention.manager.steps.verbal,
    WRITTEN_FIRST: dict.convention.manager.steps.writtenFirst,
    WRITTEN_SECOND_SUSPENSION: dict.convention.manager.steps.writtenSecond,
    TERMINATION: dict.convention.manager.steps.termination,
    GROSS_MISCONDUCT: dict.convention.manager.steps.gross,
  };
  return map[step] ?? step;
}

function formatDate(iso: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

export function EmployeeDisciplineList({
  lang,
  dict,
  records,
  defaultSignature,
}: {
  lang: Locale;
  dict: Dictionary;
  records: DisciplineRecordEntry[];
  defaultSignature: string;
}) {
  const pending = records.filter((r) => r.requiresEmployeeSignature && !r.employeeSignedAt);

  if (pending.length === 0) return null;

  return (
    <section className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
      <h2 className="text-base font-semibold">{dict.convention.myRecordsTitle}</h2>
      <p className="mt-1 text-sm text-foreground-muted">{dict.convention.myRecordsSubtitle}</p>
      <ul className="mt-4 space-y-4">
        {pending.map((record) => (
          <DisciplineSignCard
            key={record.id}
            lang={lang}
            dict={dict}
            record={record}
            defaultSignature={defaultSignature}
          />
        ))}
      </ul>
    </section>
  );
}

function DisciplineSignCard({
  lang,
  dict,
  record,
  defaultSignature,
}: {
  lang: Locale;
  dict: Dictionary;
  record: DisciplineRecordEntry;
  defaultSignature: string;
}) {
  const [signature, setSignature] = useState(defaultSignature);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSign() {
    setError(null);
    startTransition(async () => {
      const result = await signDisciplinaryRecordAction(record.id, signature, comment || undefined);
      if (!result.ok) {
        const map: Record<string, string> = {
          invalid_signature: dict.convention.errors.invalidSignature,
          not_found: dict.convention.errors.notFound,
          already_signed: dict.convention.errors.alreadySigned,
          signature_not_required: dict.convention.errors.notRequired,
          database_error: dict.convention.errors.databaseError,
        };
        setError(map[result.error] ?? dict.convention.errors.databaseError);
        return;
      }
      window.location.reload();
    });
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{record.infractionLabel}</p>
        <Badge tone="warning">{stepLabel(dict, record.disciplineStep)}</Badge>
      </div>
      <p className="mt-2 text-sm text-foreground-muted">{record.facts}</p>
      <p className="mt-1 text-xs text-foreground-muted">
        {formatDate(record.occurredAt, lang)} · {record.managerName}
      </p>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-muted">{dict.convention.signatureLabel}</span>
        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-2 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-muted">{dict.convention.commentOptional}</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <Button
        className="mt-3 w-full"
        size="sm"
        disabled={isPending || signature.trim().length < 2}
        onClick={handleSign}
      >
        <FileSignature className="mr-2 h-4 w-4" aria-hidden />
        {isPending ? dict.convention.signing : dict.convention.acknowledgeCta}
      </Button>
    </li>
  );
}
