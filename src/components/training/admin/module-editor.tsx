"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeButtonClass, overlayClass, sheetContentClass } from "@/components/ui/modal-chrome";
import { VideoEmbed } from "@/components/training/video-embed";
import { upsertTrainingModuleAction } from "@/lib/actions/training-catalog";
import type {
  CatalogCategoryRow,
  CatalogModuleRow,
} from "@/lib/data/training-catalog";
import type { FormationModuleKind } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { categoryName } from "@/components/training/admin/category-name";
import { stationLabel, type StationRecord } from "@/lib/stations/display";
import { FORMATION_MODULE_KINDS } from "@/lib/training/kinds";
import { parseVideoUrl } from "@/lib/training/video";
import type { FormationStep } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const KINDS = FORMATION_MODULE_KINDS;

type Draft = {
  title: string;
  summary: string;
  body: string;
  steps: FormationStep[];
  kind: FormationModuleKind;
  categoryId: string | null;
  stationId: string | null;
  isMandatory: boolean;
  requiresSignature: boolean;
  estimatedMinutes: number;
  videoUrl: string;
  unlockDay: number;
};

function emptyDraft(categoryId: string | null): Draft {
  return {
    title: "",
    summary: "",
    body: "",
    steps: [],
    kind: "CLASS_PLAN",
    categoryId,
    stationId: null,
    isMandatory: false,
    requiresSignature: false,
    estimatedMinutes: 5,
    videoUrl: "",
    unlockDay: 0,
  };
}

export function ModuleEditor({
  open,
  onOpenChange,
  module,
  defaultCategoryId,
  categories,
  stations,
  lang,
  dict,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = création. */
  module: CatalogModuleRow | null;
  defaultCategoryId: string | null;
  categories: CatalogCategoryRow[];
  stations: StationRecord[];
  lang: Locale;
  dict: Dictionary;
  onSaved: (moduleId: string, wasCreated: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={cn(sheetContentClass, "max-w-xl")}>
          {/* La clé remonte le formulaire : l'état repart du cours sélectionné. */}
          <ModuleForm
            key={module?.id ?? `new:${defaultCategoryId ?? "none"}`}
            module={module}
            defaultCategoryId={defaultCategoryId}
            categories={categories}
            stations={stations}
            lang={lang}
            dict={dict}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModuleForm({
  module,
  defaultCategoryId,
  categories,
  stations,
  lang,
  dict,
  onClose,
  onSaved,
}: {
  module: CatalogModuleRow | null;
  defaultCategoryId: string | null;
  categories: CatalogCategoryRow[];
  stations: StationRecord[];
  lang: Locale;
  dict: Dictionary;
  onClose: () => void;
  onSaved: (moduleId: string, wasCreated: boolean) => void;
}) {
  const copy = dict.manager.sops;
  const [draft, setDraft] = useState<Draft>(() =>
    module
      ? {
          title: module.title,
          summary: module.summary ?? "",
          body: module.body,
          steps: module.steps,
          kind: module.kind,
          categoryId: module.categoryId,
          stationId: module.stationId,
          isMandatory: module.isMandatory,
          requiresSignature: module.requiresSignature,
          estimatedMinutes: module.estimatedMinutes ?? 5,
          videoUrl: module.videoUrl ?? "",
          unlockDay: module.unlockDay,
        }
      : emptyDraft(defaultCategoryId),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(next: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function addStep() {
    setDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, { order: prev.steps.length + 1, title: "", body: "" }],
    }));
  }

  function patchStep(index: number, next: Partial<FormationStep>) {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, ...next } : step)),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    setDraft((prev) => {
      const next = [...prev.steps];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, steps: next };
    });
  }

  function removeStep(index: number) {
    setDraft((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  }

  const videoInvalid = draft.videoUrl.trim().length > 0 && !parseVideoUrl(draft.videoUrl);
  const canSubmit =
    draft.title.trim().length >= 3 && draft.body.trim().length >= 10 && !videoInvalid;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await upsertTrainingModuleAction({
        id: module?.id,
        title: draft.title,
        summary: draft.summary,
        body: draft.body,
        steps: draft.steps,
        kind: draft.kind,
        categoryId: draft.categoryId,
        stationId: draft.stationId,
        isMandatory: draft.isMandatory,
        requiresSignature: draft.requiresSignature,
        estimatedMinutes: draft.estimatedMinutes,
        videoUrl: draft.videoUrl,
        unlockDay: draft.unlockDay,
      });
      if (!result.ok) {
        const map = copy.errors as Record<string, string>;
        setError(map[result.error] ?? copy.errors.invalidInput);
        return;
      }
      onSaved(result.id, !module);
      onClose();
    });
  }

  return (
    <>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-tight">
                {module ? copy.editModule : copy.newCourse}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-foreground-muted">
                {copy.editorSubtitle}
              </Dialog.Description>
            </div>
            <Dialog.Close className={closeButtonClass} aria-label={copy.close}>
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{copy.fieldTitle}</span>
              <input
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder={copy.titlePlaceholder}
                className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">
                {copy.fieldSummary}
              </span>
              <input
                value={draft.summary}
                onChange={(event) => patch({ summary: event.target.value })}
                placeholder={copy.summaryPlaceholder}
                className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground-muted">
                  {copy.fieldCategory}
                </span>
                <select
                  value={draft.categoryId ?? ""}
                  onChange={(event) => patch({ categoryId: event.target.value || null })}
                  className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                >
                  <option value="">{copy.uncategorized}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {categoryName(category, lang)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground-muted">{copy.fieldKind}</span>
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    patch({ kind: event.target.value as FormationModuleKind })
                  }
                  className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {dict.training.kind[kind]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground-muted">
                  {copy.fieldStation}
                </span>
                <select
                  value={draft.stationId ?? ""}
                  disabled={draft.kind === "ONBOARDING"}
                  onChange={(event) => patch({ stationId: event.target.value || null })}
                  className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent disabled:opacity-50"
                >
                  <option value="">{copy.stationUniversal}</option>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {stationLabel(station, lang)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground-muted">
                  {copy.estimatedTime}
                </span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={draft.estimatedMinutes}
                  onChange={(event) =>
                    patch({ estimatedMinutes: Number(event.target.value) || 1 })
                  }
                  className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">
                {copy.fieldUnlockDay}
              </span>
              <input
                type="number"
                min={0}
                max={30}
                value={draft.unlockDay}
                onChange={(event) => patch({ unlockDay: Number(event.target.value) || 0 })}
                className="h-9 w-32 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
              />
              <span className="text-xs text-foreground-muted">{copy.unlockDayHint}</span>
            </label>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{copy.fieldVideo}</span>
              <input
                type="url"
                value={draft.videoUrl}
                onChange={(event) => patch({ videoUrl: event.target.value })}
                placeholder="https://www.youtube.com/watch?v=…"
                className={cn(
                  "h-9 rounded-xl border bg-surface px-3 text-sm outline-none focus:border-accent",
                  videoInvalid ? "border-danger" : "border-border",
                )}
              />
              <span className={cn("text-xs", videoInvalid ? "text-danger" : "text-foreground-muted")}>
                {videoInvalid ? copy.errors.invalidVideoUrl : copy.videoHint}
              </span>
            </label>

            {!videoInvalid && draft.videoUrl.trim() && (
              <div className="mt-3">
                <VideoEmbed url={draft.videoUrl} title={draft.title || copy.fieldVideo} />
              </div>
            )}

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{copy.fieldBody}</span>
              <textarea
                value={draft.body}
                onChange={(event) => patch({ body: event.target.value })}
                placeholder={copy.bodyPlaceholder}
                rows={6}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <span className="text-xs text-foreground-muted">{copy.markdownHint}</span>
            </label>

            <div className="mt-5 flex flex-col gap-2">
              <Toggle
                label={copy.mandatoryLabel}
                hint={copy.mandatoryAlert}
                checked={draft.isMandatory}
                onChange={(isMandatory) => patch({ isMandatory })}
              />
              <Toggle
                label={copy.signatureLabel}
                hint={copy.signatureAlert}
                checked={draft.requiresSignature}
                onChange={(requiresSignature) => patch({ requiresSignature })}
              />
            </div>

            <section className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{copy.stepsTitle}</h3>
                  <p className="text-xs text-foreground-muted">{copy.stepsHint}</p>
                </div>
                <Button size="sm" onClick={addStep}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {copy.addStep}
                </Button>
              </div>

              <ol className="mt-3 flex flex-col gap-3">
                {draft.steps.map((step, index) => (
                  <li
                    key={index}
                    className="rounded-2xl border border-border bg-surface-muted/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground-muted">
                        {copy.stepLabel.replace("{n}", String(index + 1))}
                      </span>
                      <div className="flex items-center gap-1">
                        <IconButton
                          label={copy.moveUp}
                          disabled={index === 0}
                          onClick={() => moveStep(index, -1)}
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={copy.moveDown}
                          disabled={index === draft.steps.length - 1}
                          onClick={() => moveStep(index, 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                        <IconButton label={copy.removeStep} onClick={() => removeStep(index)}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </IconButton>
                      </div>
                    </div>
                    <input
                      value={step.title}
                      onChange={(event) => patchStep(index, { title: event.target.value })}
                      placeholder={copy.stepTitlePlaceholder}
                      className="mt-2 h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                    />
                    <textarea
                      value={step.body}
                      onChange={(event) => patchStep(index, { body: event.target.value })}
                      placeholder={copy.stepBodyPlaceholder}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                  </li>
                ))}
              </ol>
            </section>

            {error && <p className="mt-4 text-xs text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              {copy.cancel}
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit || isPending}>
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {isPending ? copy.saving : copy.editModule}
            </Button>
          </div>
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-foreground-muted">{hint}</span>
      </span>
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted disabled:opacity-30"
    >
      {children}
    </button>
  );
}
