import "server-only";

import type { InstructorPayType, OnboardingStatus, Role } from "@/generated/prisma/enums";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canAccessManagerSettings } from "@/lib/auth/session-client";
import { getTeamOnboardingSummaries } from "@/lib/data/hr-onboarding";
import { prisma } from "@/lib/prisma";
import type { StationKindValue } from "@/lib/stations/dance-defaults";
import type { StationRecord } from "@/lib/stations/display";
import { asPlainNumber } from "./serialize";

export type TeamMemberOnboarding = {
  status: OnboardingStatus;
  step1Complete: boolean;
  step2Complete: boolean;
  step3Complete: boolean;
};

export type TeamMemberEntry = {
  id: string;
  locationId: string;
  userId: string;
  stationId: string;
  station: StationRecord;
  isPrimary: boolean;
  hiredAt: string | null;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    profilePictureUrl: string | null;
  };
  hourlyRate: number | null;
  maxHoursPerWeek: number | null;
  /** Instructor compensation model when configured. */
  instructorPayType: InstructorPayType | null;
  /** Flat / hourly / commission rate for instructor pay. */
  instructorPayRate: number | null;
  onboarding: TeamMemberOnboarding | null;
  /** Dance styles this person actually teaches, from their scheduled classes. */
  danceStyles: string[];
  /** Weekly class count driving `danceStyles`. */
  weeklyClassCount: number;
};

export type TeamRoster = {
  locationId: string;
  locationName: string;
  /** Departments (roster grouping) — rooms live on the Salles page. */
  stations: StationRecord[];
  members: TeamMemberEntry[];
};

function mapStation(row: {
  id: string;
  locationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  slug: string | null;
  sortOrder: number;
  kind: StationKindValue;
  isActive: boolean;
  capacity: number | null;
  surfaceSqm: number | null;
}): StationRecord {
  return {
    id: row.id,
    locationId: row.locationId,
    nameFr: row.nameFr,
    nameEn: row.nameEn,
    nameEs: row.nameEs,
    colorHex: row.colorHex,
    slug: row.slug,
    sortOrder: row.sortOrder,
    kind: row.kind,
    isActive: row.isActive,
    capacity: row.capacity,
    surfaceSqm: row.surfaceSqm,
  };
}

/**
 * Styles taught per instructor, from the classes they're scheduled on at this
 * location. Falls back to `User.specialties` for staff with no class yet.
 */
async function getInstructorStyles(
  locationId: string,
  userIds: string[],
): Promise<Map<string, { styles: string[]; classCount: number }>> {
  const result = new Map<string, { styles: string[]; classCount: number }>();
  if (userIds.length === 0) return result;

  const sessions = await prisma.classSession.findMany({
    where: { instructorId: { in: userIds }, room: { locationId } },
    select: { instructorId: true, course: { select: { style: true } } },
  });

  for (const session of sessions) {
    const entry = result.get(session.instructorId) ?? { styles: [], classCount: 0 };
    entry.classCount += 1;
    const style = session.course.style.trim();
    if (style && !entry.styles.includes(style)) entry.styles.push(style);
    result.set(session.instructorId, entry);
  }

  for (const entry of result.values()) entry.styles.sort((a, b) => a.localeCompare(b));
  return result;
}

export async function getTeamRosterForUser(
  userId: string,
  viewerRole?: Role,
): Promise<TeamRoster | null> {
  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const role =
    viewerRole ??
    (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role ??
    "EMPLOYEE";
  const includeRates = canAccessManagerSettings(role);

  const [rows, stationRows] = await Promise.all([
    prisma.locationMember.findMany({
      where: { locationId: membership.locationId },
      include: {
        user: {
          include: { employeeProfile: true },
        },
        station: true,
      },
      orderBy: [{ user: { role: "asc" } }, { user: { fullName: "asc" } }],
    }),
    prisma.station.findMany({
      where: { locationId: membership.locationId, isActive: true, kind: "DEPARTMENT" },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
  ]);

  const employeeIds = rows.filter((row) => row.user.role === "EMPLOYEE").map((row) => row.userId);
  const [onboardingSummaries, styleMap] = await Promise.all([
    getTeamOnboardingSummaries(employeeIds),
    getInstructorStyles(
      membership.locationId,
      rows.map((row) => row.userId),
    ),
  ]);
  const stations = stationRows.map(mapStation);

  return {
    locationId: membership.locationId,
    locationName: membership.location.name,
    stations,
    members: rows.map((row) => ({
      id: row.id,
      locationId: row.locationId,
      userId: row.userId,
      stationId: row.stationId,
      station: mapStation(row.station),
      isPrimary: row.isPrimary,
      hiredAt: row.hiredAt?.toISOString() ?? null,
      user: {
        id: row.user.id,
        email: row.user.email,
        fullName: row.user.fullName,
        role: row.user.role,
        profilePictureUrl: row.user.profilePictureUrl,
      },
      hourlyRate:
        includeRates && row.user.employeeProfile
          ? asPlainNumber(row.user.employeeProfile.hourlyRate)
          : null,
      maxHoursPerWeek: includeRates
        ? (row.user.employeeProfile?.maxHoursPerWeek ?? null)
        : null,
      instructorPayType: includeRates ? (row.user.instructorPayType ?? null) : null,
      instructorPayRate:
        includeRates && row.user.instructorPayRate != null
          ? asPlainNumber(row.user.instructorPayRate)
          : null,
      onboarding:
        row.user.role === "EMPLOYEE"
          ? (onboardingSummaries.get(row.userId) ?? {
              status: "NOT_STARTED" as OnboardingStatus,
              step1Complete: false,
              step2Complete: false,
              step3Complete: false,
            })
          : null,
      danceStyles: styleMap.get(row.userId)?.styles ?? row.user.specialties ?? [],
      weeklyClassCount: styleMap.get(row.userId)?.classCount ?? 0,
    })),
  };
}
