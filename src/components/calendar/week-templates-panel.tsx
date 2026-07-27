"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, ChevronDown, ChevronUp, Copy, LayoutTemplate, Trash2 } from "lucide-react";
import {
  applyScheduleTemplateAction,
  deleteScheduleTemplateAction,
  saveWeekAsTemplateAction,
} from "@/lib/actions/schedule-templates";
import type { ScheduleTemplateSummary } from "@/lib/data/schedule-templates";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string): string {
  const map = dict.weekTemplates.errors;
  if (code === "unauthorized") return map.unauthorized;
  if (code === "no_location") return map.noLocation;
  if (code === "invalid_date") return map.invalidDate;
  if (code === "name_required") return map.nameRequired;
  if (code === "no_shifts") return map.noShifts;
  if (code === "template_not_found") return map.templateNotFound;
  if (code === "empty_template") return map.emptyTemplate;
  return map.databaseError;
}

export function WeekTemplatesPanel({
  weekStartIso,
  templates: initialTemplates,
  dict,
}: {
  weekStartIso: string;
  templates: ScheduleTemplateSummary[];
  dict: Dictionary;
}) {
  const router = useRouter();
  const t = dict.weekTemplates;
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(
    null,
  );
  const [isSaving, startSave] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"apply" | "delete" | null>(null);
  const [isMutating, startMutate] = useTransition();

  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  function handleSave() {
    setMessage(null);
    startSave(async () => {
      const result = await saveWeekAsTemplateAction({
        weekStartIso,
        name,
        description: description || undefined,
      });
      if (!result.ok) {
        setMessage({ tone: "danger", text: resolveError(dict, result.error) });
        return;
      }
      setMessage({
        tone: "success",
        text: t.savedSuccess.replace("{name}", name.trim()).replace("{count}", String(result.shiftCount)),
      });
      setName("");
      setDescription("");
      setShowSaveForm(false);
      setTemplates((prev) => [
        {
          id: result.templateId,
          name: name.trim(),
          description: description.trim() || null,
          shiftCount: result.shiftCount,
          assignedCount: 0,
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      router.refresh();
    });
  }

  function handleApply(templateId: string) {
    if (!window.confirm(t.confirmApply)) return;
    setMessage(null);
    setPendingId(templateId);
    setPendingAction("apply");
    startMutate(async () => {
      const result = await applyScheduleTemplateAction({ templateId, weekStartIso });
      setPendingId(null);
      setPendingAction(null);
      if (!result.ok) {
        setMessage({ tone: "danger", text: resolveError(dict, result.error) });
        return;
      }
      setMessage({
        tone: result.unassignedCount > 0 ? "warning" : "success",
        text: t.appliedSuccess
          .replace("{created}", String(result.createdCount))
          .replace("{assigned}", String(result.assignedCount))
          .replace("{unassigned}", String(result.unassignedCount)),
      });
      router.refresh();
    });
  }

  function handleDelete(templateId: string) {
    if (!window.confirm(t.confirmDelete)) return;
    setMessage(null);
    setPendingId(templateId);
    setPendingAction("delete");
    const previous = templates;
    setTemplates((prev) => prev.filter((row) => row.id !== templateId));
    startMutate(async () => {
      const result = await deleteScheduleTemplateAction(templateId);
      setPendingId(null);
      setPendingAction(null);
      if (!result.ok) {
        setTemplates(previous);
        setMessage({ tone: "danger", text: resolveError(dict, result.error) });
        return;
      }
      setMessage({ tone: "success", text: t.deletedSuccess });
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <LayoutTemplate className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">{t.panelTitle}</p>
            <p className="text-xs text-foreground-muted">{t.panelSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <span className="metric rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-foreground-muted dark:bg-white/10">
              {templates.length}
            </span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-foreground-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-foreground-muted" />
          )}
        </div>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 border-t border-zinc-200/60 p-4 dark:border-white/5">
      <div className="flex justify-end">
        <Button
          type="button"
          variant={showSaveForm ? "secondary" : "primary"}
          size="sm"
          onClick={() => setShowSaveForm((v) => !v)}
          disabled={isSaving || isMutating}
        >
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
          {t.saveButton}
        </Button>
      </div>

      {showSaveForm && (
        <div className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {t.nameLabel}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={80}
              className="h-10 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-sm outline-none ring-accent/30 focus:ring-2 dark:border-white/10 dark:bg-zinc-900/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {t.descriptionLabel}
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.descriptionPlaceholder}
              maxLength={200}
              className="h-10 w-full rounded-xl border border-zinc-200/80 bg-white px-3 text-sm outline-none ring-accent/30 focus:ring-2 dark:border-white/10 dark:bg-zinc-900/60"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowSaveForm(false)}>
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isSaving || !name.trim()}
              onClick={handleSave}
            >
              {isSaving ? t.saving : t.saveButton}
            </Button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200/80 px-3 py-6 text-center text-xs text-foreground-muted dark:border-white/10">
          {t.empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {templates.map((template) => {
            const busy = isMutating && pendingId === template.id;
            return (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <p className="text-[11px] text-foreground-muted">
                    {t.shiftCount.replace("{count}", String(template.shiftCount))}
                    {" · "}
                    {t.assignedCount.replace("{count}", String(template.assignedCount))}
                    {template.description ? ` · ${template.description}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleApply(template.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    <Copy className="h-3 w-3" aria-hidden />
                    {busy && pendingAction === "apply" ? t.applying : t.applyButton}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(template.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    aria-label={t.deleteButton}
                    title={t.deleteButton}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {message && (
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-xs",
            message.tone === "success" && "bg-success/10 text-success",
            message.tone === "warning" && "bg-warning/10 text-warning",
            message.tone === "danger" && "bg-danger/10 text-danger",
          )}
          role="status"
        >
          {message.text}
        </p>
      )}
          </div>
        </div>
      </div>
    </section>
  );
}
