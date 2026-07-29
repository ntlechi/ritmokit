"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import {
  ArrowLeft,
  Clock,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { AudienceDrawer } from "@/components/training/admin/audience-drawer";
import { categoryIcon } from "@/components/training/admin/catalog-icons";
import { categoryName } from "@/components/training/admin/category-name";
import { CategoryDialog } from "@/components/training/admin/category-dialog";
import { ModuleEditor } from "@/components/training/admin/module-editor";
import { Button } from "@/components/ui/button";
import {
  archiveTrainingCategoryAction,
  deleteTrainingModuleAction,
  reorderTrainingModulesAction,
  setModulePublishedAction,
} from "@/lib/actions/training-catalog";
import type {
  CatalogCategoryRow,
  CatalogModuleRow,
  TrainingCatalogAdmin,
} from "@/lib/data/training-catalog";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

const DRAG_TYPE = "text/training-module-id";

type Filter = "all" | "published" | "drafts" | "unassigned";

/** Colonne du tableau : un rayon, ou la pile « Non classés » (`id: null`). */
type Shelf = {
  id: string | null;
  category: CatalogCategoryRow | null;
  modules: CatalogModuleRow[];
};

export function TrainingCatalogManager({
  catalog,
  lang,
  dict,
}: {
  catalog: TrainingCatalogAdmin;
  lang: Locale;
  dict: Dictionary;
}) {
  const copy = dict.manager.sops;
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<CatalogModuleRow | null>(null);
  const [editorCategoryId, setEditorCategoryId] = useState<string | null>(null);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CatalogCategoryRow | null>(null);

  const [audienceModuleId, setAudienceModuleId] = useState<string | null>(null);

  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /**
   * Le glisser-déposer applique l'ordre localement avant l'aller-retour serveur,
   * sinon la carte « saute » le temps de la revalidation.
   */
  const [modules, applyMove] = useOptimistic(
    catalog.modules,
    (
      current: CatalogModuleRow[],
      move: { moduleId: string; categoryId: string | null; beforeId: string | null },
    ) => {
      const moved = current.find((item) => item.id === move.moduleId);
      if (!moved) return current;
      const rest = current.filter((item) => item.id !== move.moduleId);
      const updated = { ...moved, categoryId: move.categoryId };
      if (!move.beforeId) return [...rest, updated];
      const index = rest.findIndex((item) => item.id === move.beforeId);
      if (index === -1) return [...rest, updated];
      return [...rest.slice(0, index), updated, ...rest.slice(index)];
    },
  );

  const matchesFilter = (module: CatalogModuleRow) => {
    if (filter === "published") return module.isActive;
    if (filter === "drafts") return !module.isActive;
    if (filter === "unassigned") return module.assignments.length === 0;
    return true;
  };

  const shelves = useMemo<Shelf[]>(() => {
    const needle = query.trim().toLowerCase();
    const visible = modules.filter((module) => {
      if (!matchesFilter(module)) return false;
      if (!needle) return true;
      return (
        module.title.toLowerCase().includes(needle) ||
        (module.summary ?? "").toLowerCase().includes(needle)
      );
    });

    const byShelf = (categoryId: string | null) =>
      visible
        .filter((module) => module.categoryId === categoryId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

    return [
      ...catalog.categories.map((category) => ({
        id: category.id,
        category,
        modules: byShelf(category.id),
      })),
      { id: null, category: null, modules: byShelf(null) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesFilter dérive de `filter`
  }, [modules, catalog.categories, query, filter]);

  /** Toujours relu depuis le catalogue frais, pour refléter un enregistrement. */
  const audienceModule = useMemo(
    () => catalog.modules.find((module) => module.id === audienceModuleId) ?? null,
    [catalog.modules, audienceModuleId],
  );

  const stats = useMemo(
    () => ({
      courses: catalog.modules.length,
      published: catalog.modules.filter((module) => module.isActive).length,
      drafts: catalog.modules.filter((module) => !module.isActive).length,
      categories: catalog.categories.length,
    }),
    [catalog.modules, catalog.categories],
  );

  function commitMove(moduleId: string, categoryId: string | null, beforeId: string | null) {
    setError(null);
    const shelf = shelves.find((item) => item.id === categoryId);
    const ordered = (shelf?.modules ?? []).filter((module) => module.id !== moduleId);
    const insertAt = beforeId ? ordered.findIndex((module) => module.id === beforeId) : -1;
    const nextOrder = [...ordered];
    const movedModule = modules.find((module) => module.id === moduleId);
    if (!movedModule) return;
    nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, movedModule);

    startTransition(async () => {
      applyMove({ moduleId, categoryId, beforeId });
      const result = await reorderTrainingModulesAction(
        nextOrder.map((module, index) => ({
          moduleId: module.id,
          categoryId,
          sortOrder: index,
        })),
      );
      if (!result.ok) {
        const map = copy.errors as Record<string, string>;
        setError(map[result.error] ?? copy.errors.databaseError);
      }
      router.refresh();
    });
  }

  function togglePublished(module: CatalogModuleRow) {
    setError(null);
    startTransition(async () => {
      const result = await setModulePublishedAction(module.id, !module.isActive);
      if (!result.ok) {
        const map = copy.errors as Record<string, string>;
        setError(map[result.error] ?? copy.errors.databaseError);
        return;
      }
      router.refresh();
    });
  }

  function removeModule(module: CatalogModuleRow) {
    if (!window.confirm(copy.deleteConfirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTrainingModuleAction(module.id);
      if (!result.ok) {
        const map = copy.errors as Record<string, string>;
        setError(map[result.error] ?? copy.errors.databaseError);
        return;
      }
      router.refresh();
    });
  }

  function archiveCategory(category: CatalogCategoryRow) {
    if (!window.confirm(copy.archiveConfirm)) return;
    setError(null);
    startTransition(async () => {
      const result = await archiveTrainingCategoryAction(category.id);
      if (!result.ok) {
        const map = copy.errors as Record<string, string>;
        setError(map[result.error] ?? copy.errors.databaseError);
        return;
      }
      router.refresh();
    });
  }

  function openEditor(module: CatalogModuleRow | null, categoryId: string | null) {
    setEditingModule(module);
    setEditorCategoryId(categoryId);
    setEditorOpen(true);
  }

  const hasContent = catalog.modules.length > 0 || catalog.categories.length > 0;
  const hasVisible = shelves.some((shelf) => shelf.modules.length > 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4">
        <Link
          href={`/${lang}/sops`}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {copy.backToCatalog}
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{copy.catalogTitle}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{copy.catalogSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setEditingCategory(null);
                setCategoryOpen(true);
              }}
            >
              <FolderPlus className="h-4 w-4" aria-hidden />
              {copy.newCategory}
            </Button>
            <Button variant="primary" onClick={() => openEditor(null, null)}>
              <Plus className="h-4 w-4" aria-hidden />
              {copy.newCourse}
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={copy.statCourses} value={stats.courses} />
          <Stat label={copy.statPublished} value={stats.published} />
          <Stat label={copy.statDrafts} value={stats.drafts} />
          <Stat label={copy.statCategories} value={stats.categories} />
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="h-9 w-full rounded-full border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", copy.filterAll],
                ["published", copy.filterPublished],
                ["drafts", copy.filterDrafts],
                ["unassigned", copy.filterUnassigned],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === key
                    ? "border-foreground bg-foreground text-surface"
                    : "border-border hover:bg-surface-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-2.5 text-xs text-danger">
            {error}
          </p>
        )}
      </header>

      {!hasContent ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border py-16 text-center">
          <h2 className="text-base font-semibold">{copy.emptyBoard}</h2>
          <p className="max-w-sm text-sm text-foreground-muted">{copy.emptyBoardHint}</p>
          <Button
            variant="primary"
            onClick={() => {
              setEditingCategory(null);
              setCategoryOpen(true);
            }}
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            {copy.newCategory}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-foreground-muted">{copy.dragHint}</p>
          {!hasVisible && <p className="text-sm text-foreground-muted">{copy.noResults}</p>}

          <div className="flex flex-col gap-5">
            {shelves.map((shelf) => {
              if (shelf.id === null && shelf.modules.length === 0) return null;
              const Icon = shelf.category ? categoryIcon(shelf.category.icon) : null;
              const accent = shelf.category?.colorHex ?? "#52525b";
              const isDropTarget = dropTarget === (shelf.id ?? "__none__");

              return (
                <section
                  key={shelf.id ?? "__none__"}
                  onDragOver={(event) => {
                    if (!dragging) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTarget(shelf.id ?? "__none__");
                  }}
                  onDragLeave={() =>
                    setDropTarget((prev) =>
                      prev === (shelf.id ?? "__none__") ? null : prev,
                    )
                  }
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropTarget(null);
                    const moduleId = event.dataTransfer.getData(DRAG_TYPE);
                    if (moduleId) commitMove(moduleId, shelf.id, null);
                  }}
                  className={cn(
                    "rounded-3xl border bg-surface p-4 transition-colors",
                    isDropTarget ? "border-accent bg-accent/5" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {Icon ? (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                            color: accent,
                          }}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">
                          {shelf.category
                            ? categoryName(shelf.category, lang)
                            : copy.uncategorized}
                        </h2>
                        <p className="text-xs text-foreground-muted">
                          {copy.categoryCount.replace("{count}", String(shelf.modules.length))}
                        </p>
                      </div>
                      {shelf.category && !shelf.category.isLocal && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                          {copy.inheritedBadge}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button size="sm" onClick={() => openEditor(null, shelf.id)}>
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        {copy.newCourse}
                      </Button>
                      {shelf.category && (
                        <>
                          <IconAction
                            label={copy.editCategory}
                            onClick={() => {
                              setEditingCategory(shelf.category);
                              setCategoryOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </IconAction>
                          <IconAction
                            label={copy.archiveCategory}
                            onClick={() => archiveCategory(shelf.category!)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </IconAction>
                        </>
                      )}
                    </div>
                  </div>

                  <ul className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                    {shelf.modules.map((module) => (
                      <li
                        key={module.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(DRAG_TYPE, module.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragging(module.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropTarget(null);
                        }}
                        onDragOver={(event) => {
                          if (!dragging || dragging === module.id) return;
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDropTarget(null);
                          const moduleId = event.dataTransfer.getData(DRAG_TYPE);
                          if (moduleId && moduleId !== module.id) {
                            commitMove(moduleId, shelf.id, module.id);
                          }
                        }}
                        className={cn(
                          "group flex cursor-grab flex-col rounded-2xl border bg-surface-muted/40 p-3 transition-opacity active:cursor-grabbing",
                          dragging === module.id ? "opacity-40" : "opacity-100",
                          module.isActive ? "border-border" : "border-dashed border-border",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical
                            className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold">{module.title}</h3>
                            {module.summary && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">
                                {module.summary}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              module.isActive
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "bg-surface-muted text-foreground-muted",
                            )}
                          >
                            {module.isActive ? copy.publishedBadge : copy.draftBadge}
                          </span>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-foreground-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden />
                            {module.estimatedMinutes ?? 5} {dict.training.minutes}
                          </span>
                          {module.videoUrl && (
                            <span className="inline-flex items-center gap-1">
                              <Video className="h-3 w-3" aria-hidden />
                              {dict.training.videoBadge}
                            </span>
                          )}
                          {module.stationId && (
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    catalog.stations.find((s) => s.id === module.stationId)
                                      ?.colorHex ?? accent,
                                }}
                                aria-hidden
                              />
                              {(() => {
                                const station = catalog.stations.find(
                                  (s) => s.id === module.stationId,
                                );
                                return station ? stationLabel(station, lang) : null;
                              })()}
                            </span>
                          )}
                          {module.isMandatory && (
                            <span className="font-medium text-foreground">
                              {copy.mandatoryBadge}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setAudienceModuleId(module.id)}
                          className={cn(
                            "mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            module.assignments.length === 0
                              ? "border-warning/30 bg-warning/10 text-warning"
                              : "border-border hover:bg-surface",
                          )}
                        >
                          <Users className="h-3 w-3" aria-hidden />
                          {module.assignments.length === 0
                            ? copy.noAudience
                            : copy.learners.replace("{count}", String(module.assignedCount))}
                        </button>

                        {module.assignedCount > 0 && (
                          <div className="mt-2">
                            <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{
                                  width: `${Math.round(
                                    (module.completedCount / module.assignedCount) * 100,
                                  )}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-foreground-muted">
                              {copy.completion
                                .replace("{done}", String(module.completedCount))
                                .replace("{total}", String(module.assignedCount))}
                            </p>
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/60 pt-2">
                          <IconAction
                            label={module.isActive ? copy.unpublish : copy.publish}
                            onClick={() => togglePublished(module)}
                          >
                            {module.isActive ? (
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </IconAction>
                          <IconAction
                            label={copy.editModule}
                            onClick={() => openEditor(module, module.categoryId)}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </IconAction>
                          <IconAction
                            label={copy.deleteModule}
                            onClick={() => removeModule(module)}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </IconAction>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}

      <ModuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        module={editingModule}
        defaultCategoryId={editorCategoryId}
        categories={catalog.categories}
        stations={catalog.stations}
        lang={lang}
        dict={dict}
        onSaved={(moduleId, wasCreated) => {
          router.refresh();
          // Un cours neuf naît en brouillon sans public : on enchaîne
          // directement sur « Qui suit ce cours ? ».
          if (wasCreated) setAudienceModuleId(moduleId);
        }}
      />

      <CategoryDialog
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        category={editingCategory}
        dict={dict}
        onSaved={() => router.refresh()}
      />

      <AudienceDrawer
        open={audienceModule !== null}
        onOpenChange={(next) => {
          if (!next) setAudienceModuleId(null);
        }}
        module={audienceModule}
        employees={catalog.employees}
        stations={catalog.stations}
        lang={lang}
        dict={dict}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="metric mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
    >
      {children}
    </button>
  );
}
