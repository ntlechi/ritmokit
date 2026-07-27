"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeButtonClass, contentClass, overlayClass } from "@/components/ui/modal-chrome";
import {
  CATEGORY_COLORS,
  CATEGORY_ICON_KEYS,
  categoryIcon,
} from "@/components/training/admin/catalog-icons";
import { upsertTrainingCategoryAction } from "@/lib/actions/training-catalog";
import type { CatalogCategoryRow } from "@/lib/data/training-catalog";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

type Draft = {
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  icon: string;
};

const EMPTY: Draft = {
  nameFr: "",
  nameEn: "",
  nameEs: "",
  colorHex: CATEGORY_COLORS[0],
  icon: "book",
};

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  dict,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = création. */
  category: CatalogCategoryRow | null;
  dict: Dictionary;
  onSaved: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          className={cn(
            contentClass,
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          )}
        >
          {/* La clé remonte le formulaire : l'état repart des valeurs du rayon. */}
          <CategoryForm
            key={category?.id ?? "new"}
            category={category}
            dict={dict}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CategoryForm({
  category,
  dict,
  onClose,
  onSaved,
}: {
  category: CatalogCategoryRow | null;
  dict: Dictionary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const copy = dict.manager.sops;
  const [draft, setDraft] = useState<Draft>(() =>
    category
      ? {
          nameFr: category.nameFr,
          nameEn: category.nameEn,
          nameEs: category.nameEs,
          colorHex: category.colorHex,
          icon: category.icon ?? "book",
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await upsertTrainingCategoryAction({
        id: category?.id,
        ...draft,
      });
      if (!result.ok) {
        const map = copy.errors as Record<string, string>;
        setError(map[result.error] ?? copy.errors.invalidInput);
        return;
      }
      onSaved();
      onClose();
    });
  }

  const canSubmit =
    draft.nameFr.trim().length >= 2 &&
    draft.nameEn.trim().length >= 2 &&
    draft.nameEs.trim().length >= 2;

  return (
    <>
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200/80 px-5 py-4 dark:border-white/10">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight">
                {category ? copy.editCategoryTitle : copy.newCategoryTitle}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-foreground-muted">
                {copy.catalogSubtitle}
              </Dialog.Description>
            </div>
            <Dialog.Close className={closeButtonClass} aria-label={copy.close}>
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label={copy.categoryNameFr}
                value={draft.nameFr}
                onChange={(nameFr) => setDraft((prev) => ({ ...prev, nameFr }))}
              />
              <Field
                label={copy.categoryNameEn}
                value={draft.nameEn}
                onChange={(nameEn) => setDraft((prev) => ({ ...prev, nameEn }))}
              />
              <Field
                label={copy.categoryNameEs}
                value={draft.nameEs}
                onChange={(nameEs) => setDraft((prev) => ({ ...prev, nameEs }))}
              />
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-foreground-muted">
                {copy.categoryColor}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, colorHex: color }))}
                    aria-label={color}
                    aria-pressed={draft.colorHex === color}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform",
                      draft.colorHex === color
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-medium text-foreground-muted">
                {copy.categoryIcon}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORY_ICON_KEYS.map((key) => {
                  const Icon = categoryIcon(key);
                  const active = draft.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, icon: key }))}
                      aria-label={key}
                      aria-pressed={active}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                        active
                          ? "border-foreground bg-surface-muted"
                          : "border-border hover:bg-surface-muted",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-200/80 px-5 py-4 dark:border-white/10">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              {copy.cancel}
            </Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit || isPending}>
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {isPending ? copy.saving : copy.newCategory}
            </Button>
          </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
