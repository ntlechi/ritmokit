"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState, useTransition } from "react";
import { Check, Globe2, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeButtonClass, overlayClass, sheetContentClass } from "@/components/ui/modal-chrome";
import { UserAvatar } from "@/components/ui/user-avatar";
import { setModuleAssignmentsAction } from "@/lib/actions/training-catalog";
import type {
  CatalogEmployeeRow,
  CatalogModuleRow,
} from "@/lib/data/training-catalog";
import type { Role } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel, type StationRecord } from "@/lib/stations/display";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: Role[] = [
  "EMPLOYEE",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "INSTRUCTOR",
  "FRONT_DESK",
  "STUDENT",
];

type Selection = {
  everyone: boolean;
  roles: Role[];
  stationIds: string[];
  userIds: string[];
  dueAt: string;
};

function toSelection(module: CatalogModuleRow): Selection {
  const everyone = module.assignments.some((rule) => rule.audience === "EVERYONE");
  const dueAt = module.assignments.find((rule) => rule.dueAt)?.dueAt ?? null;
  return {
    everyone,
    roles: module.assignments
      .filter((rule) => rule.audience === "ROLE" && rule.role)
      .map((rule) => rule.role as Role),
    stationIds: module.assignments
      .filter((rule) => rule.audience === "STATION" && rule.stationId)
      .map((rule) => rule.stationId as string),
    userIds: module.assignments
      .filter((rule) => rule.audience === "USER" && rule.userId)
      .map((rule) => rule.userId as string),
    dueAt: dueAt ? dueAt.slice(0, 10) : "",
  };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function AudienceDrawer({
  open,
  onOpenChange,
  module,
  employees,
  stations,
  lang,
  dict,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: CatalogModuleRow | null;
  employees: CatalogEmployeeRow[];
  stations: StationRecord[];
  lang: Locale;
  dict: Dictionary;
  onSaved: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={sheetContentClass}>
          {module && (
            /* La clé remonte le panneau : la sélection repart des règles du cours. */
            <AudienceForm
              key={module.id}
              module={module}
              employees={employees}
              stations={stations}
              lang={lang}
              dict={dict}
              onClose={() => onOpenChange(false)}
              onSaved={onSaved}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AudienceForm({
  module,
  employees,
  stations,
  lang,
  dict,
  onClose,
  onSaved,
}: {
  module: CatalogModuleRow;
  employees: CatalogEmployeeRow[];
  stations: StationRecord[];
  lang: Locale;
  dict: Dictionary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const copy = dict.manager.sops;
  const [selection, setSelection] = useState<Selection>(() => toSelection(module));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) => employee.fullName.toLowerCase().includes(needle));
  }, [employees, query]);

  /** Aperçu du nombre de personnes visées — même union que le serveur. */
  const reach = useMemo(() => {
    if (selection.everyone) return employees.length;
    const matched = new Set<string>();
    for (const employee of employees) {
      const hit =
        selection.roles.includes(employee.role) ||
        (employee.stationId !== null && selection.stationIds.includes(employee.stationId)) ||
        selection.userIds.includes(employee.userId);
      if (hit) matched.add(employee.userId);
    }
    return matched.size;
  }, [employees, selection]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setModuleAssignmentsAction({
        moduleId: module.id,
        everyone: selection.everyone,
        roles: selection.everyone ? [] : selection.roles,
        stationIds: selection.everyone ? [] : selection.stationIds,
        userIds: selection.everyone ? [] : selection.userIds,
        dueAt: selection.dueAt || null,
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

  const narrowed = !selection.everyone;

  return (
    <>
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-tight">
                {copy.assignTitle}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-xs text-foreground-muted">
                {module.title || copy.assignSubtitle}
              </Dialog.Description>
            </div>
            <Dialog.Close className={closeButtonClass} aria-label={copy.close}>
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <button
              type="button"
              onClick={() =>
                setSelection((prev) => ({ ...prev, everyone: !prev.everyone }))
              }
              aria-pressed={selection.everyone}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                selection.everyone
                  ? "border-accent bg-accent-muted"
                  : "border-border hover:bg-surface-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  selection.everyone ? "bg-accent text-accent-foreground" : "bg-surface-muted",
                )}
              >
                <Globe2 className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{copy.audienceEveryone}</span>
                <span className="block text-xs text-foreground-muted">
                  {copy.audienceEveryoneHint}
                </span>
              </span>
              {selection.everyone && <Check className="h-4 w-4 text-accent" aria-hidden />}
            </button>

            <div
              className={cn("mt-5 flex flex-col gap-5", !narrowed && "opacity-40")}
              inert={!narrowed}
              aria-hidden={!narrowed}
            >
              <Group label={copy.audienceRoles}>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map((role) => (
                    <Chip
                      key={role}
                      label={dict.roles[role]}
                      active={selection.roles.includes(role)}
                      onClick={() =>
                        setSelection((prev) => ({ ...prev, roles: toggle(prev.roles, role) }))
                      }
                    />
                  ))}
                </div>
              </Group>

              {stations.length > 0 && (
                <Group label={copy.audienceStations}>
                  <div className="flex flex-wrap gap-2">
                    {stations.map((station) => (
                      <Chip
                        key={station.id}
                        label={stationLabel(station, lang)}
                        color={station.colorHex}
                        active={selection.stationIds.includes(station.id)}
                        onClick={() =>
                          setSelection((prev) => ({
                            ...prev,
                            stationIds: toggle(prev.stationIds, station.id),
                          }))
                        }
                      />
                    ))}
                  </div>
                </Group>
              )}

              <Group label={copy.audiencePeople}>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
                    aria-hidden
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={copy.searchEmployees}
                    className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent"
                  />
                </div>
                <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
                  {filteredEmployees.map((employee) => {
                    const selected = selection.userIds.includes(employee.userId);
                    return (
                      <li key={employee.userId}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelection((prev) => ({
                              ...prev,
                              userIds: toggle(prev.userIds, employee.userId),
                            }))
                          }
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors",
                            selected ? "bg-accent-muted text-accent" : "hover:bg-surface-muted",
                          )}
                        >
                          <UserAvatar
                            fullName={employee.fullName}
                            pictureUrl={employee.profilePictureUrl}
                            size="sm"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {employee.fullName}
                            </span>
                            <span className="block text-xs text-foreground-muted">
                              {dict.roles[employee.role]}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                              selected
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-border text-transparent",
                            )}
                          >
                            <Check className="h-3 w-3" aria-hidden />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Group>
            </div>

            <Group label={copy.dueDate} className="mt-5">
              <input
                type="date"
                value={selection.dueAt}
                onChange={(event) =>
                  setSelection((prev) => ({ ...prev, dueAt: event.target.value }))
                }
                className="h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1.5 text-xs text-foreground-muted">{copy.dueDateHint}</p>
            </Group>

            {error && <p className="mt-4 text-xs text-danger">{error}</p>}
          </div>

          <div className="border-t border-border px-5 py-4">
            <p
              className={cn(
                "mb-3 text-xs",
                reach === 0 ? "text-warning" : "text-foreground-muted",
              )}
            >
              {reach === 0
                ? copy.reachNone
                : copy.reach.replace("{count}", String(reach))}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={isPending}>
                {copy.cancel}
              </Button>
              <Button variant="primary" onClick={submit} disabled={isPending}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {isPending ? copy.saving : copy.manageAudience}
              </Button>
            </div>
          </div>
    </>
  );
}

function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {label}
      </h3>
      {children}
    </section>
  );
}

function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-muted text-accent"
          : "border-border hover:bg-surface-muted",
      )}
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
      {label}
    </button>
  );
}
