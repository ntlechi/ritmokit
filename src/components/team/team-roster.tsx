"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ClipboardList, Music4, Plus, Users } from "lucide-react";
import { Donut, ProgressRing } from "@/components/charts/primitives";
import { InviteAdminForm } from "@/components/admin/invite-admin-form";
import { addTeamMember } from "@/lib/actions/team";
import { dna } from "@/lib/design/dna";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { TeamMemberEntry, TeamRoster } from "@/lib/data/team";
import type { InstructorPayType, Role } from "@/generated/prisma/enums";
import { stationDotStyle, stationLabel } from "@/lib/stations/display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

function payLabel(dict: Dictionary, type: InstructorPayType | null): string {
  if (type === "HOURLY") return dict.team.payHourly;
  if (type === "FLAT_PER_CLASS") return dict.team.payFlat;
  if (type === "COMMISSION") return dict.team.payCommission;
  return dict.team.payUnset;
}

function formatPayRate(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

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
    invite_failed: dict.team.errors.inviteFailed,
    auth_email_conflict: dict.team.errors.authEmailConflict,
    invalid_role: dict.team.errors.invalidRole,
  };
  return map[code] ?? dict.team.errors.databaseError;
}

function completedSteps(member: TeamMemberEntry): number {
  if (!member.onboarding) return 0;
  return [
    member.onboarding.step1Complete,
    member.onboarding.step2Complete,
    member.onboarding.step3Complete,
  ].filter(Boolean).length;
}

function onboardingLabel(dict: Dictionary, member: TeamMemberEntry): string | null {
  if (member.user.role !== "EMPLOYEE" || !member.onboarding) return null;
  const steps = completedSteps(member);
  if (steps === 3) return dict.team.onboarding.complete;
  return dict.team.onboarding.inProgress.replace("{steps}", String(steps)).replace("{total}", "3");
}

/** Soft department tint derived from the station's own colour — no hardcoded palette. */
function departmentTint(colorHex: string) {
  return {
    borderColor: `color-mix(in srgb, ${colorHex} 26%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${colorHex} 4%, transparent)`,
  };
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
  const steps = completedSteps(member);
  const onboardingComplete = steps === 3;
  const showRing = showOnboarding && member.user.role === "EMPLOYEE" && member.onboarding != null;
  const stationName = stationLabel(member.station, locale);

  return (
    <button
      type="button"
      data-interactive
      onClick={() => onSelect(member)}
      style={departmentTint(member.station.colorHex)}
      className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left shadow-xs transition hover:shadow-sm"
    >
      <UserAvatar
        fullName={member.user.fullName}
        pictureUrl={member.user.profilePictureUrl}
        stationColorHex={member.station.colorHex}
        size="md"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-semibold">{member.user.fullName}</p>
          <Badge tone={roleTone(member.user.role)}>{roleLabel}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-foreground-muted">{member.user.email}</p>

        {member.danceStyles.length > 0 && (
          <ul className="mt-2 flex flex-wrap items-center gap-1.5">
            <Music4 className="h-3 w-3 shrink-0 text-foreground-muted" aria-hidden />
            {member.danceStyles.slice(0, 3).map((style) => (
              <li
                key={style}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `color-mix(in srgb, ${member.station.colorHex} 16%, transparent)`,
                }}
              >
                {style}
              </li>
            ))}
            {member.danceStyles.length > 3 && (
              <li className="text-[11px] text-foreground-muted">
                +{member.danceStyles.length - 3}
              </li>
            )}
          </ul>
        )}

        {(member.instructorPayType || member.hourlyRate != null) && (
          <p className="mt-2 text-[11px] font-medium text-foreground-muted">
            {member.instructorPayType ? (
              <>
                <span className="text-accent">{payLabel(dict, member.instructorPayType)}</span>
                {member.instructorPayRate != null && (
                  <> · {formatPayRate(member.instructorPayRate, locale)}</>
                )}
              </>
            ) : (
              <>
                <span className="text-accent">{dict.team.payHourly}</span>
                {member.hourlyRate != null && <> · {formatPayRate(member.hourlyRate, locale)}</>}
              </>
            )}
          </p>
        )}

        <p className="sr-only">{stationName}</p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {member.weeklyClassCount > 0 && (
          <div
            className="text-right"
            title={dict.team.weeklyClasses.replace("{count}", String(member.weeklyClassCount))}
          >
            <p className="metric text-xl font-semibold leading-none tabular-nums">
              {member.weeklyClassCount}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-foreground-muted">
              {dict.team.weeklyClassesShort}
            </p>
          </div>
        )}

        {showRing && (
          <ProgressRing
            value={(steps / 3) * 100}
            size={38}
            strokeWidth={4}
            label={`${steps}/3`}
            caption={onboardingText ?? dict.team.onboarding.notStarted}
            tone={onboardingComplete ? "success" : "warning"}
          />
        )}
      </div>
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
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<Role>("INSTRUCTOR");
  const [addStationId, setAddStationId] = useState(roster.stations[0]?.id ?? "");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
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

  const summary = useMemo(() => {
    const styles = new Set<string>();
    let instructors = 0;
    let weeklyClasses = 0;
    for (const member of roster.members) {
      for (const style of member.danceStyles) styles.add(style);
      if (member.weeklyClassCount > 0 || member.user.role === "INSTRUCTOR") instructors += 1;
      weeklyClasses += member.weeklyClassCount;
    }
    const segments = roster.stations
      .map((station) => ({
        label: stationLabel(station, lang),
        value: roster.members.filter((m) => m.stationId === station.id).length,
        color: station.colorHex,
      }))
      .filter((segment) => segment.value > 0);

    return { styleCount: styles.size, instructors, weeklyClasses, segments };
  }, [lang, roster.members, roster.stations]);

  function openMember(member: TeamMemberEntry) {
    setSelectedMember(member);
    setSheetOpen(true);
  }

  function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setAddError(null);
    setAddSuccess(null);

    startTransition(async () => {
      const result = await addTeamMember({
        lang,
        locationId: roster.locationId,
        email: addEmail,
        fullName: addName,
        stationId: addStationId,
        role: addRole,
      });
      if (!result.ok) {
        setAddError(resolveTeamError(dict, result.error));
        return;
      }
      setAddEmail("");
      setAddName("");
      setAddSuccess(result.invited ? dict.team.inviteSuccess : dict.team.alreadyOnTeam);
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

      {/* Roster shape at a glance */}
      <section className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground-muted">{dict.team.members}</p>
            <p className="metric mt-1 text-2xl font-semibold tabular-nums">
              {roster.members.length}
            </p>
          </div>
          {summary.segments.length > 0 && (
            <Donut
              segments={summary.segments}
              size={52}
              thickness={9}
              caption={dict.team.byDepartment}
            />
          )}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-muted">{dict.team.instructors}</p>
          <p className="metric mt-1 text-2xl font-semibold tabular-nums">{summary.instructors}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-muted">{dict.team.stylesCovered}</p>
          <p className="metric mt-1 text-2xl font-semibold tabular-nums">{summary.styleCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-foreground-muted">{dict.team.weeklyClassesTotal}</p>
          <p className="metric mt-1 text-2xl font-semibold tabular-nums">{summary.weeklyClasses}</p>
        </div>
      </section>

      <div className="border-b border-border px-4 py-3 sm:px-6">
        <div className={cn(dna.pillTrack, "w-full flex-wrap sm:w-auto")}>
          <button
            type="button"
            data-interactive
            onClick={() => setFilter("ALL")}
            aria-pressed={filter === "ALL"}
            className={cn(
              "px-3 py-1.5 text-sm font-medium",
              filter === "ALL" ? dna.pillActive : dna.pillIdle,
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
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium",
                filter === station.id ? dna.pillActive : dna.pillIdle,
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
            <p className="mb-1 text-sm font-medium">{dict.team.addMember}</p>
            <p className="mb-3 text-xs text-foreground-muted">{dict.team.inviteSubtitle}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <input
                type="text"
                value={addName}
                onChange={(event) => setAddName(event.target.value)}
                placeholder={dict.team.fullName}
                disabled={isPending}
                className={cn(dna.field, "h-10 flex-1")}
              />
              <input
                type="email"
                value={addEmail}
                onChange={(event) => setAddEmail(event.target.value)}
                placeholder={dict.team.email}
                disabled={isPending}
                required
                className={cn(dna.field, "h-10 flex-1")}
              />
              <select
                value={addRole}
                onChange={(event) => setAddRole(event.target.value as Role)}
                disabled={isPending}
                aria-label={dict.team.role}
                className={cn(dna.field, "h-10 sm:w-auto")}
              >
                <option value="INSTRUCTOR">{dict.roles.INSTRUCTOR}</option>
                <option value="FRONT_DESK">{dict.roles.FRONT_DESK}</option>
                <option value="EMPLOYEE">{dict.roles.EMPLOYEE}</option>
                {canOwner && <option value="MANAGER">{dict.roles.MANAGER}</option>}
              </select>
              <select
                value={addStationId}
                onChange={(event) => setAddStationId(event.target.value)}
                disabled={isPending}
                aria-label={dict.team.department}
                className={cn(dna.field, "h-10 sm:w-auto")}
              >
                {roster.stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {stationLabel(station, lang)}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                variant="primary"
                disabled={isPending || !addEmail.trim()}
                className="rounded-xl"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {isPending ? dict.team.inviteSending : dict.team.addMember}
              </Button>
            </div>
            {addError && <p className="mt-2 text-sm text-danger">{addError}</p>}
            {addSuccess && <p className="mt-2 text-sm text-success">{addSuccess}</p>}
          </form>
        )}

        {canOwner && <InviteAdminForm lang={lang} dict={dict} />}

        {filteredMembers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface-muted/50 px-6 py-10 text-center text-sm text-foreground-muted">
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
                <span
                  className="ml-1 h-px flex-1"
                  style={{
                    background: group.station
                      ? `linear-gradient(to right, color-mix(in srgb, ${group.station.colorHex} 40%, transparent), transparent)`
                      : undefined,
                  }}
                  aria-hidden
                />
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
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
          <div className="grid gap-2 lg:grid-cols-2">
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
