"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ClipboardList, Plus, Users } from "lucide-react";
import { addTeamMember } from "@/lib/actions/team";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { TeamMemberEntry, TeamRoster } from "@/lib/data/team";
import type { Role } from "@/generated/prisma/enums";
import { resolveStationMatrix } from "@/lib/design/station-matrix";
import { stationDotStyle, stationLabel } from "@/lib/stations/display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

const MemberSheet = dynamic(
  () => import("@/components/team/member-sheet").then((m) => m.MemberSheet),
  { ssr: false },
);

type StationFilter = "ALL" | string;

function roleTone(role: Role): "neutral" | "accent" | "warning" {
  if (role === "OWNER") return "warning";
  if (role === "MANAGER") return "accent";
  return "neutral";
}

function resolveTeamError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.team.errors.unauthorized,
    unauthorized_only_owner: dict.team.errors.unauthorizedOnlyOwner,
    database_error: dict.team.errors.databaseError,
    user_not_found: dict.team.errors.userNotFound,
    already_member: dict.team.errors.alreadyMember,
    missing_fields: dict.team.errors.missingFields,
    invalid_station: dict.team.errors.databaseError,
  };
  return map[code] ?? dict.team.errors.databaseError;
}

function onboardingLabel(dict: Dictionary, member: TeamMemberEntry): string | null {
  if (member.user.role !== "EMPLOYEE" || !member.onboarding) return null;
  if (member.onboarding.step1Complete && member.onboarding.step2Complete && member.onboarding.step3Complete) {
    return dict.team.onboarding.complete;
  }
  const steps = [
    member.onboarding.step1Complete,
    member.onboarding.step2Complete,
    member.onboarding.step3Complete,
  ].filter(Boolean).length;
  return dict.team.onboarding.inProgress.replace("{steps}", String(steps)).replace("{total}", "3");
}

function MemberCard({
  member,
  dict,
  locale,
  onSelect,
  showOnboarding,
}: {
  member: TeamMemberEntry;
  dict: Dictionary;
  locale: Locale;
  onSelect: (member: TeamMemberEntry) => void;
  showOnboarding: boolean;
}) {
  const roleLabel =
    dict.team.roles[member.user.role as keyof Dictionary["team"]["roles"]] ?? dict.roles[member.user.role];
  const onboardingText = showOnboarding ? onboardingLabel(dict, member) : null;
  const onboardingComplete =
    member.onboarding?.step1Complete && member.onboarding?.step2Complete && member.onboarding?.step3Complete;
  const stationName = stationLabel(member.station, locale);
  const matrix = resolveStationMatrix(member.station);
  const onboardingSteps = member.onboarding
    ? [
        member.onboarding.step1Complete,
        member.onboarding.step2Complete,
        member.onboarding.step3Complete,
      ].filter(Boolean).length
    : 0;
  const progressPct = showOnboarding && member.onboarding ? (onboardingSteps / 3) * 100 : null;

  return (
    <button
      type="button"
      data-interactive
      onClick={() => onSelect(member)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-xs transition hover:shadow-sm",
        matrix.capsule,
      )}
    >
      <UserAvatar
        fullName={member.user.fullName}
        pictureUrl={member.user.profilePictureUrl}
        stationColorHex={member.station.colorHex}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{member.user.fullName}</p>
          <span className={cn("station-badge", matrix.badge)}>{stationName}</span>
        </div>
        <p className="mt-0.5 truncate text-xs opacity-70">{member.user.email}</p>
        {progressPct != null && (
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  onboardingComplete ? "bg-emerald-500" : matrix.bar,
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {onboardingText && (
              <p
                className={cn(
                  "mt-1 text-[11px] font-medium",
                  onboardingComplete ? "text-emerald-700 dark:text-emerald-300" : "opacity-70",
                )}
              >
                {onboardingText}
              </p>
            )}
          </div>
        )}
      </div>
      <Badge tone={roleTone(member.user.role)}>{roleLabel}</Badge>
    </button>
  );
}

export function TeamRoster({
  lang,
  dict,
  roster,
  currentUserId,
  canManage,
  canOwner,
  hideChromeHeader = false,
}: {
  lang: Locale;
  dict: Dictionary;
  roster: TeamRoster;
  currentUserId: string;
  canManage: boolean;
  canOwner: boolean;
  /** When the page already rendered an interactive title chrome above Suspense. */
  hideChromeHeader?: boolean;
}) {
  const [filter, setFilter] = useState<StationFilter>("ALL");
  const [selectedMember, setSelectedMember] = useState<TeamMemberEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addStationId, setAddStationId] = useState(roster.stations[0]?.id ?? "");
  const [addError, setAddError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredMembers = useMemo(() => {
    if (filter === "ALL") return roster.members;
    return roster.members.filter((member) => member.stationId === filter);
  }, [filter, roster.members]);

  const grouped = useMemo(() => {
    if (filter !== "ALL") {
      const station = roster.stations.find((s) => s.id === filter);
      return [{ stationId: filter, station, members: filteredMembers }];
    }
    return roster.stations
      .map((station) => ({
        stationId: station.id,
        station,
        members: roster.members.filter((member) => member.stationId === station.id),
      }))
      .filter((group) => group.members.length > 0);
  }, [filter, filteredMembers, roster.members, roster.stations]);

  function openMember(member: TeamMemberEntry) {
    setSelectedMember(member);
    setSheetOpen(true);
  }

  function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setAddError(null);

    startTransition(async () => {
      const result = await addTeamMember({
        lang,
        locationId: roster.locationId,
        email: addEmail,
        stationId: addStationId,
      });
      if (!result.ok) {
        setAddError(resolveTeamError(dict, result.error));
        return;
      }
      setAddEmail("");
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      {!hideChromeHeader && (
        <header className="border-b border-border px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{dict.team.title}</h1>
              <p className="mt-1 text-sm text-foreground-muted">
                {roster.locationName} · {roster.members.length} {dict.team.memberCount}
              </p>
            </div>
            <div className="inline-flex items-center gap-2">
              {canManage && (
                <Link
                  href={`/${lang}/team/requests`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
                >
                  <ClipboardList className="h-4 w-4 text-accent" aria-hidden />
                  {dict.team.requests}
                </Link>
              )}
              <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-foreground-muted">
                <Users className="h-4 w-4" aria-hidden />
                {dict.team.members}
              </div>
            </div>
          </div>
        </header>
      )}

      {hideChromeHeader && (
        <p className="border-b border-border px-4 py-2 text-sm text-foreground-muted sm:px-6">
          {roster.locationName} · {roster.members.length} {dict.team.memberCount}
        </p>
      )}

      <div className="border-b border-border px-4 py-3 sm:px-6">
        <div className="inline-flex w-full flex-wrap gap-1 rounded-full border border-zinc-200/80 bg-zinc-100/80 p-1 dark:border-white/10 dark:bg-white/5 sm:w-auto">
          <button
            type="button"
            data-interactive
            onClick={() => setFilter("ALL")}
            aria-pressed={filter === "ALL"}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              filter === "ALL"
                ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            {dict.team.allStations}
          </button>
          {roster.stations.map((station) => (
            <button
              key={station.id}
              type="button"
              data-interactive
              onClick={() => setFilter(station.id)}
              aria-pressed={filter === station.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
                filter === station.id
                  ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={stationDotStyle(station.colorHex)}
                aria-hidden
              />
              {stationLabel(station, lang)}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 space-y-6 px-4 py-5 sm:px-6">
        {canManage && (
          <form
            onSubmit={handleAddMember}
            className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <p className="mb-3 text-sm font-medium">{dict.team.addMember}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={addEmail}
                onChange={(event) => setAddEmail(event.target.value)}
                placeholder={dict.team.email}
                disabled={isPending}
                required
                className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-50"
              />
              <select
                value={addStationId}
                onChange={(event) => setAddStationId(event.target.value)}
                disabled={isPending}
                className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-50"
              >
                {roster.stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {stationLabel(station, lang)}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="primary" disabled={isPending || !addEmail.trim()} className="rounded-xl">
                <Plus className="h-4 w-4" aria-hidden />
                {dict.team.addMember}
              </Button>
            </div>
            {addError && <p className="mt-2 text-sm text-danger">{addError}</p>}
          </form>
        )}

        {filteredMembers.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center text-sm text-foreground-muted">
            {dict.team.emptyRoster}
          </p>
        ) : filter === "ALL" ? (
          grouped.map((group) => (
            <section key={group.stationId} className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={group.station ? stationDotStyle(group.station.colorHex) : undefined}
                  aria-hidden
                />
                <h2 className="text-sm font-semibold">
                  {group.station ? stationLabel(group.station, lang) : group.stationId}
                </h2>
                <span className="text-xs text-foreground-muted">({group.members.length})</span>
              </div>
              <div className="grid gap-2">
                {group.members.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    dict={dict}
                    locale={lang}
                    onSelect={openMember}
                    showOnboarding={canManage}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="grid gap-2">
            {filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                dict={dict}
                locale={lang}
                onSelect={openMember}
                showOnboarding={canManage}
              />
            ))}
          </div>
        )}
      </main>

      <MemberSheet
        lang={lang}
        dict={dict}
        member={selectedMember}
        stations={roster.stations}
        locationId={roster.locationId}
        canManage={canManage}
        canOwner={canOwner}
        currentUserId={currentUserId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
