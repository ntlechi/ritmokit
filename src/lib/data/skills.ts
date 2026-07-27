import "server-only";

import type { SkillLevel } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { getDayBoundsFromLocalDate } from "@/lib/finance/labor-kpis";
import { prisma } from "@/lib/prisma";
import { getStationsForLocation } from "@/lib/data/stations";
import { nextSkillLevel } from "@/lib/skills/levels";
import { detectSuccessionGaps, type SuccessionGap } from "@/lib/skills/succession";
import { getIncompleteMandatoryModules } from "@/lib/training/compliance";
import type { StationRecord } from "@/lib/stations/display";

export type SkillMatrixMember = {
  userId: string;
  fullName: string;
  email: string;
  primaryStationId: string;
  skills: Partial<Record<string, SkillLevel>>;
};

export type SkillsMatrixDashboard = {
  locationId: string;
  locationName: string;
  stations: StationRecord[];
  members: SkillMatrixMember[];
  leadCounts: Record<string, number>;
};

export type EmployeeSkillProgress = {
  locationId: string;
  primaryStationId: string;
  primaryStation: StationRecord | null;
  currentLevel: SkillLevel;
  nextLevel: SkillLevel | null;
  skills: Partial<Record<string, SkillLevel>>;
  missingModules: { id: string; title: string }[];
};

export type DaySuccessionAlerts = {
  date: string;
  gaps: SuccessionGap[];
};

export type StationSkillSnapshot = {
  userId: string;
  fullName: string;
  primaryStationId: string;
  skills: Partial<Record<string, SkillLevel>>;
};

export async function getSkillsMatrixForManager(
  managerUserId: string,
  managerRole: string,
): Promise<SkillsMatrixDashboard | null> {
  if (!canAccessManagerSettings(managerRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return null;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId: managerUserId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
  if (!membership) return null;

  const [stations, members] = await Promise.all([
    getStationsForLocation(membership.locationId),
    prisma.locationMember.findMany({
      where: {
        locationId: membership.locationId,
        user: { role: { in: ["EMPLOYEE", "MANAGER"] } },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            stationSkills: {
              where: { locationId: membership.locationId },
              select: { stationId: true, level: true },
            },
          },
        },
      },
      orderBy: [{ user: { fullName: "asc" } }],
    }),
  ]);

  const matrixMembers: SkillMatrixMember[] = members.map((m) => {
    const skills: Partial<Record<string, SkillLevel>> = {};
    for (const skill of m.user.stationSkills) {
      skills[skill.stationId] = skill.level;
    }
    if (!skills[m.stationId]) {
      skills[m.stationId] = "JUNIOR";
    }
    return {
      userId: m.userId,
      fullName: m.user.fullName,
      email: m.user.email,
      primaryStationId: m.stationId,
      skills,
    };
  });

  const leadCounts: Record<string, number> = {};
  for (const station of stations) {
    leadCounts[station.id] = matrixMembers.filter((m) => m.skills[station.id] === "LEAD").length;
  }

  return {
    locationId: membership.locationId,
    locationName: membership.location.name,
    stations,
    members: matrixMembers,
    leadCounts,
  };
}

export async function getEmployeeSkillProgress(userId: string): Promise<EmployeeSkillProgress | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: { select: { id: true, organizationId: true } } },
  });
  if (!membership) return null;

  const [stations, skillRows] = await Promise.all([
    getStationsForLocation(membership.locationId),
    prisma.employeeStationSkill.findMany({
      where: { locationId: membership.locationId, userId },
      select: { stationId: true, level: true },
    }),
  ]);

  const skills: Partial<Record<string, SkillLevel>> = {};
  for (const row of skillRows) {
    skills[row.stationId] = row.level;
  }

  const currentLevel = skills[membership.stationId] ?? "JUNIOR";
  const next = nextSkillLevel(currentLevel);
  const primaryStation = stations.find((s) => s.id === membership.stationId) ?? null;

  const missing =
    next != null
      ? await getIncompleteMandatoryModules(
          userId,
          membership.stationId,
          membership.locationId,
          membership.location.organizationId,
        )
      : [];

  return {
    locationId: membership.locationId,
    primaryStationId: membership.stationId,
    primaryStation,
    currentLevel,
    nextLevel: next,
    skills: { ...skills, [membership.stationId]: currentLevel },
    missingModules: missing.map((m) => ({ id: m.id, title: m.title })),
  };
}

export async function getWeeklySuccessionAlerts(
  managerUserId: string,
  managerRole: string,
  days: Date[],
): Promise<DaySuccessionAlerts[] | null> {
  if (!canAccessManagerSettings(managerRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return null;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId: managerUserId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return null;

  const results = await Promise.all(
    days.map(async (day) => {
      const { dayStart, dayEnd } = getDayBoundsFromLocalDate(day);
      const gaps = await detectSuccessionGaps({
        locationId: membership.locationId,
        dayStart,
        dayEnd,
      });
      return { date: dayStart.toISOString(), gaps };
    }),
  );

  return results;
}

export async function getSkillSnapshotsForLocation(
  locationId: string,
): Promise<Map<string, StationSkillSnapshot>> {
  const members = await prisma.locationMember.findMany({
    where: { locationId, user: { role: { in: ["EMPLOYEE", "MANAGER"] } } },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          stationSkills: {
            where: { locationId },
            select: { stationId: true, level: true },
          },
        },
      },
    },
  });

  const map = new Map<string, StationSkillSnapshot>();
  for (const m of members) {
    const skills: Partial<Record<string, SkillLevel>> = {};
    for (const s of m.user.stationSkills) {
      skills[s.stationId] = s.level;
    }
    map.set(m.userId, {
      userId: m.userId,
      fullName: m.user.fullName,
      primaryStationId: m.stationId,
      skills,
    });
  }
  return map;
}
