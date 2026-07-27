import "server-only";

import type { Locale as PrismaLocale, OnboardingStatus, Role } from "@/generated/prisma/enums";
import type { StationRecord } from "@/lib/stations/display";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import { resolveSeniorityAnchor, seniorityDaysSince } from "@/lib/hr/onboarding";
import { getWeekRange } from "@/lib/calendar/grid";

/** A dossier requirement the employee (or their manager) can still close. */
export type DossierRequirementKey =
  | "photo"
  | "phone"
  | "emergencyContact"
  | "availability"
  | "convention"
  | "handbook"
  | "bankInfo"
  | "punchPin";

export type DossierRequirement = {
  key: DossierRequirementKey;
  done: boolean;
  /** Relative href (without locale prefix) where the employee can complete it. */
  href: string | null;
};

export type ProfileDossierCore = {
  identity: {
    fullName: string;
    email: string;
    role: Role;
    profilePictureUrl: string | null;
    phone: string | null;
    preferredLanguage: PrismaLocale | null;
    sinLastFour: string | null;
    onboardingStatus: OnboardingStatus | null;
  };
  placement: {
    locationId: string | null;
    locationName: string | null;
    station: StationRecord | null;
  };
  seniority: {
    /** Civil J-day count since the hire anchor, or `null` when no anchor is set. */
    days: number | null;
    anchorIso: string | null;
  };
  emergency: {
    name: string | null;
    phone: string | null;
  };
  pay: {
    hourlyRate: number | null;
    maxHoursPerWeek: number | null;
    /** Scheduled hours in the current payroll week (Sunday-anchored). */
    scheduledHoursThisWeek: number;
  };
  requirements: DossierRequirement[];
  /** 0–100 — share of dossier requirements already satisfied. */
  completionPct: number;
};

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

/** Prisma `Station` row → serialisable `StationRecord` (Decimal `tipPoints` → number). */
function toStationRecord(row: {
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
  };
}

/**
 * Composes the HR identity core of the employee dossier from the four models that
 * hold it (`User`, `EmployeeProfile`, `EmployeeHrProfile`, `LocationMember`), plus
 * the derived seniority clock, scheduled hours and dossier completion checklist.
 *
 * Domain-specific blocks (training, skills, recognition, tips…) stay in their own
 * loaders — the profile page composes them alongside this core.
 */
export async function getProfileDossierCore(userId: string): Promise<ProfileDossierCore | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      email: true,
      role: true,
      profilePictureUrl: true,
    },
  });
  if (!user) return null;

  const [membership, employeeProfile, hrProfile] = await Promise.all([
    prisma.locationMember.findFirst({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: {
        location: { select: { id: true, name: true } },
        station: true,
      },
    }),
    prisma.employeeProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        phone: true,
        preferredLanguage: true,
        hourlyRate: true,
        maxHoursPerWeek: true,
        hiredAt: true,
      },
    }),
    prisma.employeeHrProfile.findUnique({
      where: { userId },
      select: {
        onboardingStatus: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        sinLastFour: true,
        // Ciphertext only — never decrypt or return raw bank numbers to clients.
        bankInstitutionNumber: true,
        bankTransitNumber: true,
        bankAccountNumber: true,
        hasSignedHandbook: true,
        integrationStartedAt: true,
        punchPinHash: true,
      },
    }),
  ]);

  const locationId = membership?.locationId ?? null;

  const anchor = locationId
    ? resolveSeniorityAnchor({
        integrationStartedAt: hrProfile?.integrationStartedAt ?? null,
        hiredAt: membership?.hiredAt ?? employeeProfile?.hiredAt ?? null,
        locationId,
      })
    : null;

  const [availabilityCount, conventionSignature, weekShifts] = await Promise.all([
    employeeProfile
      ? prisma.employeeAvailability.count({
          where: { profileId: employeeProfile.id, isRecurring: true },
        })
      : Promise.resolve(0),
    prisma.workplaceConventionSignature.findFirst({
      where: { userId },
      select: { id: true },
    }),
    (() => {
      const { start, end } = getWeekRange(new Date());
      return prisma.shift.findMany({
        where: { employeeId: userId, startsAt: { gte: start, lt: end } },
        select: { startsAt: true, endsAt: true },
      });
    })(),
  ]);

  const scheduledHoursThisWeek = weekShifts.reduce(
    (total, shift) => total + hoursBetween(shift.startsAt, shift.endsAt),
    0,
  );

  const hasBankInfo = Boolean(
    hrProfile?.bankInstitutionNumber && hrProfile?.bankTransitNumber && hrProfile?.bankAccountNumber,
  );

  const requirements: DossierRequirement[] = [
    { key: "photo", done: Boolean(user.profilePictureUrl), href: "/settings/profile" },
    { key: "phone", done: Boolean(employeeProfile?.phone), href: "/onboarding" },
    {
      key: "emergencyContact",
      done: Boolean(hrProfile?.emergencyContactName && hrProfile?.emergencyContactPhone),
      href: "/onboarding",
    },
    { key: "availability", done: availabilityCount > 0, href: "/settings/availability" },
    { key: "convention", done: Boolean(conventionSignature), href: "/convention" },
    { key: "handbook", done: Boolean(hrProfile?.hasSignedHandbook), href: "/onboarding" },
    { key: "bankInfo", done: hasBankInfo, href: "/onboarding" },
    { key: "punchPin", done: Boolean(hrProfile?.punchPinHash), href: "/onboarding" },
  ];

  const completionPct = Math.round(
    (requirements.filter((item) => item.done).length / requirements.length) * 100,
  );

  return {
    identity: {
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      profilePictureUrl: user.profilePictureUrl,
      phone: employeeProfile?.phone ?? null,
      preferredLanguage: employeeProfile?.preferredLanguage ?? null,
      sinLastFour: hrProfile?.sinLastFour ?? null,
      onboardingStatus: hrProfile?.onboardingStatus ?? null,
    },
    placement: {
      locationId,
      locationName: membership?.location.name ?? null,
      station: membership?.station ? toStationRecord(membership.station) : null,
    },
    seniority: {
      days: anchor?.ok && locationId ? seniorityDaysSince(anchor.anchor, locationId) : null,
      anchorIso: anchor?.ok ? anchor.anchor.toISOString() : null,
    },
    emergency: {
      name: hrProfile?.emergencyContactName ?? null,
      phone: hrProfile?.emergencyContactPhone ?? null,
    },
    pay: {
      hourlyRate: employeeProfile ? Number(employeeProfile.hourlyRate) : null,
      maxHoursPerWeek: employeeProfile?.maxHoursPerWeek ?? null,
      scheduledHoursThisWeek: Math.round(scheduledHoursThisWeek * 10) / 10,
    },
    requirements,
    completionPct,
  };
}
