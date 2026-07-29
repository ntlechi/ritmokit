"use client";

import { useState } from "react";
import { format } from "date-fns";
import { fr, enUS, es } from "date-fns/locale";
import { ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { ShiftChip } from "@/components/calendar/shift-chip";
import { ReplacementFinderTrigger } from "@/components/calendar/replacement-finder-trigger";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { dna } from "@/lib/design/dna";
import { isSameDay } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";

const dateFnsLocales: Record<Locale, typeof fr> = { fr, en: enUS, es };

/** Au-delà, chaque colonne jour se replie derrière un bouton +N. */
const MAX_VISIBLE_PER_DAY = 3;

/**
 * Bassin des quarts orphelins — regroupés par jour pour refléter la grille
 * de la semaine, colonnes plafonnées, ton neutre (l'urgence vit sur les capsules).
 */
export function OrphanShiftsDrawer({
  days,
  shifts,
  locale,
  dict,
  onDelete,
  onOpenReplacement,
  onUnassignDrop,
  defaultOpen = true,
}: {
  days: Date[];
  shifts: ShiftWithEmployee[];
  locale: Locale;
  dict: Dictionary;
  onDelete: (shiftId: string) => void;
  onOpenReplacement?: (shift: ShiftWithEmployee) => void;
  /** Drop target for returning a DRAFT shift to the orphan pool. */
  onUnassignDrop?: (shiftId: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen && shifts.length > 0);
  const [dragOver, setDragOver] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const showDropZone = onUnassignDrop != null;
  if (shifts.length === 0 && !showDropZone) return null;

  const dfLocale = dateFnsLocales[locale];
  const byDay = days.map((day) => ({
    day,
    shifts: shifts
      .filter((s) => isSameDay(s.startsAt, day))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  }));

  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section
      className={cn(
        cn("overflow-hidden shadow-xs transition-colors", dna.panel),
        dragOver && "border-warning/60 bg-warning/5 ring-2 ring-warning/25",
      )}
      onDragOver={(e) => {
        if (!onUnassignDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!onUnassignDrop) return;
        const shiftId = e.dataTransfer.getData("text/shift-id");
        if (shiftId) onUnassignDrop(shiftId);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <Inbox className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">{dict.schedule.drawerTitle}</p>
            <p className="text-xs text-foreground-muted">
              {dragOver ? dict.schedule.drawerDropHint : dict.schedule.drawerSubtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="metric rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
            {shifts.length}
          </span>
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
          {shifts.length === 0 ? (
            <p className="border-t border-border px-4 py-6 text-center text-xs text-foreground-muted">
              {dict.schedule.drawerDropHint}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4 xl:grid-cols-7">
              {byDay.map(({ day, shifts: dayShifts }) => {
                const key = day.toDateString();
                const isExpanded = expandedDays.has(key);
                const visible = isExpanded ? dayShifts : dayShifts.slice(0, MAX_VISIBLE_PER_DAY);
                const hiddenCount = dayShifts.length - visible.length;

                return (
                  <div key={key} className="flex flex-col gap-1.5 bg-surface p-2">
                    <p className="flex items-baseline gap-1 px-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
                        {format(day, "EEE", { locale: dfLocale })}
                      </span>
                      <span className="metric text-[11px] text-foreground-muted">{format(day, "d")}</span>
                      {dayShifts.length > 0 && (
                        <span className="metric ml-auto text-[10px] text-foreground-muted/70">
                          {dayShifts.length}
                        </span>
                      )}
                    </p>

                    {dayShifts.length === 0 ? (
                      <p className="py-3 text-center text-[11px] text-foreground-muted/40">—</p>
                    ) : (
                      <>
                        {visible.map((shift) => (
                          <div
                            key={shift.id}
                            draggable={shift.status === "DRAFT"}
                            onDragStart={(e) => {
                              if (shift.status !== "DRAFT") {
                                e.preventDefault();
                                return;
                              }
                              e.dataTransfer.setData("text/shift-id", shift.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            className={cn(
                              "flex flex-col gap-1.5",
                              shift.status === "DRAFT" && "cursor-grab active:cursor-grabbing",
                            )}
                          >
                            <ShiftChip
                              shift={shift}
                              locale={locale}
                              dict={dict}
                              draggableHint={shift.status === "DRAFT"}
                              onDelete={() => onDelete(shift.id)}
                            />
                            {isExpanded && onOpenReplacement && (
                              <ReplacementFinderTrigger
                                shift={shift}
                                dict={dict}
                                onOpen={onOpenReplacement}
                                fullWidth
                              />
                            )}
                          </div>
                        ))}
                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            data-interactive
                            onClick={() => toggleDay(key)}
                            className="metric self-start rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                          >
                            +{hiddenCount}
                          </button>
                        )}
                        {isExpanded && (
                          <button
                            type="button"
                            data-interactive
                            onClick={() => toggleDay(key)}
                            className="self-start rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                          >
                            {dict.calendar.showLess}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
