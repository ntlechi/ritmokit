import "server-only";

import type { Role } from "@/generated/prisma/enums";
import type { OnboardingStatus } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session-client";
import { getTeamOnboardingSummaries } from "@/lib/data/hr-onboarding";
import { prisma } from "@/lib/prisma";
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
  onboarding: TeamMemberOnboarding | null;
};

export type TeamRoster = {
  locationId: string;
  locationName: string;
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
  tipPoints: { toString(): string };
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
    tipPoints: asPlainNumber(row.tipPoints),
    isActive: row.isActive,
    capacity: row.capacity,
    surfaceSqm: row.surfaceSqm,
  };
}

export async function getTeamRosterForUser(
  userId: string,
  viewerRole?: Role,
): Promise<TeamRoster | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: true,
      user: { select: { role: true } },
    },
  });
  if (!membership) return null;

  const role = viewerRole ?? membership.user.role;
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
      where: { locationId: membership.locationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
  ]);

  const employeeIds = rows.filter((row) => row.user.role === "EMPLOYEE").map((row) => row.userId);
  const onboardingSummaries = await getTeamOnboardingSummaries(employeeIds);
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
      onboarding:
        row.user.role === "EMPLOYEE"
          ? (onboardingSummaries.get(row.userId) ?? {
              status: "NOT_STARTED" as OnboardingStatus,
              step1Complete: false,
              step2Complete: false,
              step3Complete: false,
            })
          : null,
    })),
  };
}
