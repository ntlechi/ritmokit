"use client";

import { useState, useTransition } from "react";
import { Check, PenLine } from "lucide-react";
import { updateOrganizationValueAction } from "@/lib/actions/culture";
import type { CultureValueEditable } from "@/lib/data/culture";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Draft = {
  titleFr: string;
  titleEn: string;
  titleEs: string;
  behaviorFr: string;
  behaviorEn: string;
  behaviorEs: string;
};

function toDraft(value: CultureValueEditable): Draft {
  return {
    titleFr: value.titleFr,
    titleEn: value.titleEn,
    titleEs: value.titleEs,
    behaviorFr: value.behaviorFr,
    behaviorEn: value.behaviorEn,
    behaviorEs: value.behaviorEs,
  };
}

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.culture.errors.unauthorized,
    value_not_found: dict.culture.errors.valueNotFound,
    missing_fields: dict.culture.errors.missingFields,
    database_error: dict.culture.errors.databaseError,
  };
  return map[code] ?? dict.culture.errors.databaseError;
}

function ValueEditorCard({
  value,
  dict,
}: {
  value: CultureValueEditable;
  dict: Dictionary;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty =
    draft.titleFr !== value.titleFr ||
    draft.titleEn !== value.titleEn ||
    draft.titleEs !== value.titleEs ||
    draft.behaviorFr !== value.behaviorFr ||
    draft.behaviorEn !== value.behaviorEn ||
    draft.behaviorEs !== value.behaviorEs;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateOrganizationValueAction({
        valueId: value.id,
        ...draft,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    });
  }

  return (
    <article className="card-lift rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-bold tracking-wide text-accent">
          {value.valueKey}
        </span>
        <span className="text-[11px] font-medium text-foreground-muted">
          {dict.culture.activeOnFloor}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["titleFr", "FR"],
            ["titleEn", "EN"],
            ["titleEs", "ES"],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {dict.culture.titleLabel} · {label}
            </span>
            <input
              value={draft[field]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
              disabled={isPending}
              className="h-10 rounded-xl border border-border bg-surface-muted px-3 text-sm outline-none ring-accent/30 focus:border-accent focus:ring-2 disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {(
          [
            ["behaviorFr", "FR"],
            ["behaviorEn", "EN"],
            ["behaviorEs", "ES"],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {dict.culture.behaviorLabel} · {label}
            </span>
            <textarea
              value={draft[field]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
              disabled={isPending}
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm outline-none ring-accent/30 focus:border-accent focus:ring-2 disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium text-success transition-opacity",
            savedFlash ? "opacity-100" : "opacity-0",
          )}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {dict.culture.savedValue}
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={isPending || !dirty}
          onClick={save}
        >
          {isPending ? dict.culture.savingValue : dict.culture.saveValue}
        </Button>
      </div>
    </article>
  );
}

export function CultureConstitutionEditor({
  values,
  dict,
}: {
  values: CultureValueEditable[];
  dict: Dictionary;
}) {
  if (values.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900">
          <PenLine className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{dict.culture.editorTitle}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{dict.culture.editorSubtitle}</p>
        </div>
      </div>

      <div className="grid gap-4">
        {values.map((value) => (
          <ValueEditorCard key={value.id} value={value} dict={dict} />
        ))}
      </div>
    </section>
  );
}
