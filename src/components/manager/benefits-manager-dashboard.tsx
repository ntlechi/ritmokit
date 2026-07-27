"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Plus, Trash2 } from "lucide-react";
import {
  deleteLocationBenefitAction,
  toggleLocationBenefitAction,
  upsertLocationBenefitAction,
} from "@/lib/actions/benefits";
import type { BenefitsManagerDashboard, LocationBenefitRow } from "@/lib/data/benefits";
import type { BenefitType } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TYPES: BenefitType[] = ["INSURANCE", "RETIREMENT", "PERK", "DOCUMENT"];

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.benefits.errors.unauthorized,
    invalid_title: dict.benefits.errors.invalidTitle,
    invalid_description: dict.benefits.errors.invalidDescription,
    invalid_type: dict.benefits.errors.invalidType,
    invalid_url: dict.benefits.errors.invalidUrl,
    not_found: dict.benefits.errors.notFound,
    database_error: dict.benefits.errors.databaseError,
  };
  return map[code] ?? dict.benefits.errors.databaseError;
}

function typeTone(type: BenefitType): "neutral" | "accent" | "warning" {
  if (type === "INSURANCE" || type === "RETIREMENT") return "accent";
  if (type === "PERK") return "warning";
  return "neutral";
}

export function BenefitsManagerDashboardView({
  data,
  dict,
}: {
  data: BenefitsManagerDashboard;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [benefits, setBenefits] = useState(data.benefits);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<BenefitType>("PERK");
  const [externalUrl, setExternalUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  function openNew() {
    setEditingId("new");
    setTitle("");
    setDescription("");
    setType("PERK");
    setExternalUrl("");
    setIsActive(true);
    setError(null);
  }

  function openEdit(b: LocationBenefitRow) {
    setEditingId(b.id);
    setTitle(b.title);
    setDescription(b.description);
    setType(b.type);
    setExternalUrl(b.externalUrl ?? "");
    setIsActive(b.isActive);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await upsertLocationBenefitAction({
        id: editingId === "new" ? undefined : (editingId ?? undefined),
        locationId: data.locationId,
        title,
        description,
        type,
        externalUrl: externalUrl || undefined,
        isActive,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function toggle(b: LocationBenefitRow) {
    setError(null);
    const next = !b.isActive;
    setBenefits((prev) => prev.map((row) => (row.id === b.id ? { ...row, isActive: next } : row)));
    startTransition(async () => {
      const result = await toggleLocationBenefitAction({
        id: b.id,
        locationId: data.locationId,
        isActive: next,
      });
      if (!result.ok) {
        setBenefits((prev) =>
          prev.map((row) => (row.id === b.id ? { ...row, isActive: b.isActive } : row)),
        );
        setError(resolveError(dict, result.error));
      }
    });
  }

  function remove(b: LocationBenefitRow) {
    setError(null);
    startTransition(async () => {
      const result = await deleteLocationBenefitAction({
        id: b.id,
        locationId: data.locationId,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setBenefits((prev) => prev.filter((row) => row.id !== b.id));
      if (editingId === b.id) setEditingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted">{dict.benefits.managerHint}</p>
        <Button type="button" size="sm" onClick={openNew} className="shrink-0 gap-1.5">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {dict.benefits.addBenefit}
        </Button>
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {editingId && (
        <div className="space-y-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-semibold">
            {editingId === "new" ? dict.benefits.addBenefit : dict.benefits.editBenefit}
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={dict.benefits.titlePlaceholder}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={dict.benefits.descriptionPlaceholder}
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BenefitType)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {dict.benefits.types[t]}
                </option>
              ))}
            </select>
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder={dict.benefits.urlPlaceholder}
              className="min-w-[200px] flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {dict.benefits.activeLabel}
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={isPending} onClick={save}>
              {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {dict.common.save}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>
              {dict.common.cancel}
            </Button>
          </div>
        </div>
      )}

      {benefits.length === 0 && !editingId ? (
        <p className="rounded-2xl border border-border bg-surface-muted px-4 py-8 text-center text-sm text-foreground-muted">
          {dict.benefits.emptyManager}
        </p>
      ) : (
        <ul className="space-y-2">
          {benefits.map((b) => (
            <li
              key={b.id}
              className={cn(
                "rounded-2xl border bg-surface p-4 shadow-sm",
                b.isActive ? "border-border" : "border-border/50 opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Gift className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <p className="text-sm font-semibold">{b.title}</p>
                    <Badge tone={typeTone(b.type)}>{dict.benefits.types[b.type]}</Badge>
                    {!b.isActive && <Badge tone="neutral">{dict.benefits.inactive}</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-foreground-muted">{b.description}</p>
                  {b.externalUrl && (
                    <a
                      href={b.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
                    >
                      {dict.benefits.openLink}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={() => openEdit(b)}>
                    {dict.benefits.editBenefit}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={() => toggle(b)}>
                    {b.isActive ? dict.benefits.deactivate : dict.benefits.activate}
                  </Button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => remove(b)}
                    className="rounded-lg p-2 text-danger hover:bg-danger/10 disabled:opacity-50"
                    aria-label={dict.benefits.delete}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
