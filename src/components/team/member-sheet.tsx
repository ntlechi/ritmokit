"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  removeTeamMember,
  toggleMemberPrimary,
  updateTeamMemberRole,
  updateTeamMemberStation,
} from "@/lib/actions/team";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { TeamMemberEntry } from "@/lib/data/team";
import { stationDotStyle, stationLabel, type StationRecord } from "@/lib/stations/display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { overlayClass, sheetContentClass } from "@/components/ui/modal-chrome";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

const EDITABLE_ROLES = ["EMPLOYEE", "MANAGER", "OWNER"] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

function resolveTeamError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.team.errors.unauthorized,
    unauthorized_only_owner: dict.team.errors.unauthorizedOnlyOwner,
    database_error: dict.team.errors.databaseError,
    user_not_found: dict.team.errors.userNotFound,
    already_member: dict.team.errors.alreadyMember,
    cannot_modify_self: dict.team.errors.cannotModifySelf,
    invalid_role: dict.team.errors.invalidRole,
    missing_fields: dict.team.errors.missingFields,
    invalid_station: dict.team.errors.databaseError,
  };
  return map[code] ?? dict.team.errors.databaseError;
}

function initialRole(member: TeamMemberEntry): EditableRole {
  return EDITABLE_ROLES.includes(member.user.role as EditableRole)
    ? (member.user.role as EditableRole)
    : "EMPLOYEE";
}

function MemberSheetBody({
  lang,
  dict,
  member,
  stations,
  locationId,
  canManage,
  canOwner,
  currentUserId,
  onClose,
}: {
  lang: Locale;
  dict: Dictionary;
  member: TeamMemberEntry;
  stations: StationRecord[];
  locationId: string;
  canManage: boolean;
  canOwner: boolean;
  currentUserId: string;
  onClose: () => void;
}) {
  const [stationId, setStationId] = useState(member.stationId);
  const [role, setRole] = useState<EditableRole>(() => initialRole(member));
  const [isPrimary, setIsPrimary] = useState(member.isPrimary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSelf = member.userId === currentUserId;
  const readOnly = !canManage || isSelf;
  const selectedStation = stations.find((s) => s.id === stationId) ?? member.station;

  function handleSave() {
    if (readOnly) return;
    setError(null);

    startTransition(async () => {
      const stationResult = await updateTeamMemberStation({
        lang,
        locationId,
        memberId: member.id,
        stationId,
      });
      if (!stationResult.ok) {
        setError(resolveTeamError(dict, stationResult.error));
        return;
      }

      if (canOwner && role !== member.user.role) {
        const roleResult = await updateTeamMemberRole({
          lang,
          locationId,
          memberId: member.id,
          role,
        });
        if (!roleResult.ok) {
          setError(resolveTeamError(dict, roleResult.error));
          return;
        }
      }

      if (isPrimary !== member.isPrimary) {
        const primaryResult = await toggleMemberPrimary({
          lang,
          locationId,
          memberId: member.id,
          isPrimary,
        });
        if (!primaryResult.ok) {
          setError(resolveTeamError(dict, primaryResult.error));
          return;
        }
      }

      onClose();
    });
  }

  function handleRemove() {
    if (!canOwner || isSelf) return;
    if (!window.confirm(dict.team.confirmRemove)) return;

    setError(null);
    startTransition(async () => {
      const result = await removeTeamMember({ lang, locationId, memberId: member.id });
      if (!result.ok) {
        setError(resolveTeamError(dict, result.error));
        return;
      }
      onClose();
    });
  }

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar
            fullName={member.user.fullName}
            pictureUrl={member.user.profilePictureUrl}
            stationColorHex={member.station.colorHex}
            size="lg"
          />
          <div className="min-w-0">
            <Dialog.Title className="truncate text-lg font-semibold tracking-tight">
              {dict.team.editMember}
            </Dialog.Title>
            <Dialog.Description className="mt-1 truncate text-sm text-foreground-muted">
              {member.user.fullName}
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-zinc-100 dark:hover:bg-white/5"
          aria-label={dict.common.cancel}
        >
          <X className="h-4 w-4" />
        </Dialog.Close>
      </header>

      <div className="flex-1 space-y-6 overflow-auto px-5 py-5">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground-muted">{dict.team.fullName}</p>
          <p className="text-sm font-medium">{member.user.fullName}</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground-muted">{dict.team.email}</p>
          <p className="text-sm">{member.user.email}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            {dict.team.accessLevel}
          </p>
          {canOwner && !isSelf && EDITABLE_ROLES.includes(member.user.role as EditableRole) ? (
            <div className="space-y-2">
              <div className="inline-flex w-full rounded-xl border border-zinc-200/80 bg-zinc-100 p-1 dark:border-white/10 dark:bg-white/5">
                {EDITABLE_ROLES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-interactive
                    disabled={isPending}
                    onClick={() => setRole(value)}
                    aria-pressed={role === value}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium sm:text-sm",
                      role === value
                        ? "bg-white text-foreground shadow-xs dark:bg-zinc-900"
                        : "text-foreground-muted hover:text-foreground",
                    )}
                  >
                    {dict.team.roles[value]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-foreground-muted">
                {role === "MANAGER"
                  ? dict.team.roleManagerHint
                  : role === "EMPLOYEE"
                    ? dict.team.roleEmployeeHint
                    : dict.team.roles.OWNER}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <Badge tone="accent">
                {dict.team.roles[member.user.role as keyof Dictionary["team"]["roles"]] ??
                  dict.roles[member.user.role]}
              </Badge>
              {!canOwner && (
                <p className="mt-1.5 text-[11px] text-foreground-muted">{dict.team.roleOwnerOnly}</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground-muted">{dict.team.station}</p>
          {readOnly ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
              <span
                className="h-3 w-3 rounded-full"
                style={stationDotStyle(selectedStation.colorHex)}
                aria-hidden
              />
              {stationLabel(selectedStation, lang)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {stations.map((station) => {
                const selected = stationId === station.id;
                return (
                  <button
                    key={station.id}
                    type="button"
                    data-interactive
                    disabled={isPending}
                    onClick={() => setStationId(station.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium",
                      selected
                        ? "border-accent bg-accent-muted text-accent"
                        : "border-zinc-200/80 bg-white text-foreground-muted hover:bg-zinc-50 hover:text-foreground dark:border-white/10 dark:bg-zinc-900/60 dark:hover:bg-white/5",
                    )}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={stationDotStyle(station.colorHex)}
                      aria-hidden
                    />
                    {stationLabel(station, lang)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {canManage && !isSelf && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-3 dark:border-white/10 dark:bg-white/5">
            <span className="text-sm font-medium">{dict.team.activeOnFloor}</span>
            <input
              type="checkbox"
              checked={isPrimary}
              disabled={isPending || readOnly}
              onChange={(event) => setIsPrimary(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-accent dark:border-white/20"
            />
          </label>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {!readOnly && (
        <footer className="flex flex-col gap-2 border-t border-zinc-200/80 px-5 py-4 dark:border-white/10">
          <Button
            variant="primary"
            className="w-full rounded-xl"
            disabled={isPending}
            onClick={handleSave}
          >
            {isPending ? dict.team.saving : dict.team.saveChanges}
          </Button>
          {canOwner && !isSelf && (
            <Button
              variant="danger"
              className="w-full rounded-xl"
              disabled={isPending}
              onClick={handleRemove}
            >
              {dict.team.removeMember}
            </Button>
          )}
        </footer>
      )}
    </>
  );
}

export function MemberSheet({
  lang,
  dict,
  member,
  stations,
  locationId,
  canManage,
  canOwner,
  currentUserId,
  open,
  onOpenChange,
}: {
  lang: Locale;
  dict: Dictionary;
  member: TeamMemberEntry | null;
  stations: StationRecord[];
  locationId: string;
  canManage: boolean;
  canOwner: boolean;
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        {member && (
          <Dialog.Content className={sheetContentClass}>
            <MemberSheetBody
              key={member.id}
              lang={lang}
              dict={dict}
              member={member}
              stations={stations}
              locationId={locationId}
              canManage={canManage}
              canOwner={canOwner}
              currentUserId={currentUserId}
              onClose={() => onOpenChange(false)}
            />
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
