import type { ShiftModel } from "@/generated/prisma/models";
import { prisma } from "@/lib/prisma";
import { getMandatoryModulesForStation } from "@/lib/training/compliance";
import {
  getCnesstWeekBounds,
  getDayOfWeekInTimeZone,
} from "@/lib/time/cnesst-week";
import { DEFAULT_LOCATION_TIMEZONE } from "@/lib/time/location-timezone";

const TORONTO_TZ = DEFAULT_LOCATION_TIMEZONE;
/// Repos consécutif minimal exigé par la LNT (art. 78) — identique au seuil
/// bloquant appliqué par le trigger Postgres `enforce_cnesst_rules()` au
/// moment de la publication. Réutilisé par le moteur Auto-Planif pour éviter
/// de générer des brouillons qui échoueraient à la publication.
export const MIN_REST_HOURS = 32;
export const MAX_WEEKLY_HOURS = 40;
export const SHORT_NOTICE_DAYS = 28;

export type MatchCandidateArgs = {
  locationId: string;
  stationId: string;
  shiftDate: Date;
  startsAt: Date;
  endsAt: Date;
  startTime: string;
  endTime: string;
  excludeUserId?: string | null;
  excludeShiftId?: string;
  /** RSI 2 playbook — élargit le balayage aux autres stations (polyvalents). */
  allowCrossStation?: boolean;
  /** Si true avec allowCrossStation : station d'origine d'abord, puis le reste. */
  preferSameStationFirst?: boolean;
};

export type ReplacementCandidate = {
  userId: string;
  profileId: string;
  fullName: string;
  profilePictureUrl: string | null;
};

export type RejectionReason =
  | "no_profile"
  | "approved_time_off"
  | "no_recurring_availability"
  | "shift_conflict"
  | "weekly_hours_exceeded"
  | "rest_violation"
  | "training_incomplete";

export type CandidateScanResult = {
  candidates: ReplacementCandidate[];
  scanned: number;
  rejections: Array<{
    userId: string;
    fullName: string;
    profilePictureUrl: string | null;
    reason: RejectionReason;
  }>;
};

export type CrisisPolicyAssessment = {
  isShortNotice: boolean;
  policyViolation: "SHORT_NOTICE_DROP_UNDER_4_WEEKS" | "STANDARD_DROP";
  severity: "HIGH" | "LOW";
};

/**
 * Croise la grille récurrente, les congés approuvés, les conflits de quarts
 * et le blindage CNESST (40h / 32h repos) pour sortir les remplaçants admissibles.
 */
export async function findAvailableReplacements({
  locationId,
  stationId,
  shiftDate,
  startsAt,
  endsAt,
  startTime,
  endTime,
  excludeUserId,
  excludeShiftId,
  allowCrossStation = false,
  preferSameStationFirst = true,
}: MatchCandidateArgs): Promise<CandidateScanResult> {
  const dayOfWeek = getDayOfWeekInToronto(shiftDate);
  const dateOnly = toDateOnlyInToronto(shiftDate);
  const shiftHours = shiftDurationHours(startsAt, endsAt);

  const members = await prisma.locationMember.findMany({
    where: {
      locationId,
      ...(allowCrossStation ? {} : { stationId }),
      user: {
        role: "EMPLOYEE",
        id: excludeUserId ? { not: excludeUserId } : undefined,
      },
    },
    include: {
      user: {
        include: {
          employeeProfile: {
            include: {
              availabilities: {
                where: { dayOfWeek, isRecurring: true },
              },
              timeOffRequests: {
                where: {
                  status: "APPROVED",
                  startDate: { lte: dateOnly },
                  endDate: { gte: dateOnly },
                },
              },
            },
          },
        },
      },
    },
  });

  // Station d'origine d'abord si balayage élargi (playbook RSI 2).
  const orderedMembers =
    allowCrossStation && preferSameStationFirst
      ? [
          ...members.filter((m) => m.stationId === stationId),
          ...members.filter((m) => m.stationId !== stationId),
        ]
      : members;

  const userIds = orderedMembers.map((m) => m.userId);
  const { weekStart, weekEnd } = getCnesstWeekBounds(startsAt, TORONTO_TZ);
  const restPadMs = (MIN_REST_HOURS + 24 * 7) * 3_600_000;
  const restLookback = new Date(startsAt.getTime() - restPadMs);
  const restLookahead = new Date(endsAt.getTime() + restPadMs);

  const [location, relevantShifts] = await Promise.all([
    prisma.location.findUnique({
      where: { id: locationId },
      select: { organizationId: true },
    }),
    userIds.length === 0
      ? Promise.resolve(
          [] as Array<{ employeeId: string | null; startsAt: Date; endsAt: Date }>,
        )
      : prisma.shift.findMany({
          where: {
            employeeId: { in: userIds },
            status: { notIn: ["REJECTED"] },
            id: excludeShiftId ? { not: excludeShiftId } : undefined,
            startsAt: { lt: restLookahead },
            endsAt: { gt: restLookback },
          },
          select: { employeeId: true, startsAt: true, endsAt: true },
        }),
  ]);

  const shiftsByUser = new Map<string, Array<{ startsAt: Date; endsAt: Date }>>();
  for (const row of relevantShifts) {
    if (!row.employeeId) continue;
    const bucket = shiftsByUser.get(row.employeeId) ?? [];
    bucket.push({ startsAt: row.startsAt, endsAt: row.endsAt });
    shiftsByUser.set(row.employeeId, bucket);
  }

  let mandatoryModuleIds: string[] = [];
  const completedByUser = new Map<string, Set<string>>();
  if (location && userIds.length > 0) {
    const modules = await getMandatoryModulesForStation(
      stationId,
      locationId,
      location.organizationId,
    );
    mandatoryModuleIds = modules.map((m) => m.id);
    if (mandatoryModuleIds.length > 0) {
      const completed = await prisma.employeeFormationProgress.findMany({
        where: {
          userId: { in: userIds },
          moduleId: { in: mandatoryModuleIds },
          status: "COMPLETED",
        },
        select: { userId: true, moduleId: true },
      });
      for (const row of completed) {
        const set = completedByUser.get(row.userId) ?? new Set<string>();
        set.add(row.moduleId);
        completedByUser.set(row.userId, set);
      }
    }
  }

  const rejections: CandidateScanResult["rejections"] = [];
  const eligible: ReplacementCandidate[] = [];

  for (const member of orderedMembers) {
    const profile = member.user.employeeProfile;
    const fullName = member.user.fullName;
    const profilePictureUrl = member.user.profilePictureUrl;
    const reject = (reason: RejectionReason) =>
      rejections.push({ userId: member.userId, fullName, profilePictureUrl, reason });

    if (!profile) {
      reject("no_profile");
      continue;
    }

    if (profile.timeOffRequests.length > 0) {
      reject("approved_time_off");
      continue;
    }

    const withinAvailability = profile.availabilities.some(
      (slot) => slot.startTime <= startTime && slot.endTime >= endTime,
    );
    if (!withinAvailability) {
      reject("no_recurring_availability");
      continue;
    }

    const userShifts = shiftsByUser.get(member.userId) ?? [];

    if (userShifts.some((s) => s.startsAt < endsAt && s.endsAt > startsAt)) {
      reject("shift_conflict");
      continue;
    }

    const weekHours =
      userShifts
        .filter((s) => s.startsAt >= weekStart && s.startsAt < weekEnd)
        .reduce((sum, s) => sum + shiftDurationHours(s.startsAt, s.endsAt), 0) + shiftHours;
    if (weekHours > MAX_WEEKLY_HOURS) {
      reject("weekly_hours_exceeded");
      continue;
    }

    const previous = userShifts
      .filter((s) => s.endsAt <= startsAt)
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
    if (
      previous &&
      (startsAt.getTime() - previous.endsAt.getTime()) / 3_600_000 < MIN_REST_HOURS
    ) {
      reject("rest_violation");
      continue;
    }

    const next = userShifts
      .filter((s) => s.startsAt >= endsAt)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    if (next && (next.startsAt.getTime() - endsAt.getTime()) / 3_600_000 < MIN_REST_HOURS) {
      reject("rest_violation");
      continue;
    }

    if (mandatoryModuleIds.length > 0) {
      const done = completedByUser.get(member.userId) ?? new Set<string>();
      if (mandatoryModuleIds.some((id) => !done.has(id))) {
        reject("training_incomplete");
        continue;
      }
    }

    eligible.push({
      userId: member.userId,
      profileId: profile.id,
      fullName,
      profilePictureUrl,
    });
  }

  return {
    candidates: eligible,
    scanned: orderedMembers.length,
    rejections,
  };
}

export async function findAvailableReplacementsForShift(
  shift: ShiftModel,
  playbook?: { allowCrossStation?: boolean; preferSameStationFirst?: boolean },
): Promise<CandidateScanResult> {
  return findAvailableReplacements({
    locationId: shift.locationId,
    stationId: shift.stationId,
    shiftDate: shift.startsAt,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    startTime: formatTimeHm(shift.startsAt),
    endTime: formatTimeHm(shift.endsAt),
    excludeUserId: shift.employeeId,
    excludeShiftId: shift.id,
    allowCrossStation: playbook?.allowCrossStation ?? false,
    preferSameStationFirst: playbook?.preferSameStationFirst ?? true,
  });
}

/** Politique Bati : abandon à moins de 4 semaines du quart = assiduité HIGH. */
export function assessShortNoticePolicy(shiftStartsAt: Date): CrisisPolicyAssessment {
  const now = new Date();
  const fourWeeksFromNow = new Date(now);
  fourWeeksFromNow.setDate(now.getDate() + SHORT_NOTICE_DAYS);

  const isShortNotice = shiftStartsAt < fourWeeksFromNow;

  return {
    isShortNotice,
    policyViolation: isShortNotice ? "SHORT_NOTICE_DROP_UNDER_4_WEEKS" : "STANDARD_DROP",
    severity: isShortNotice ? "HIGH" : "LOW",
  };
}

function formatTimeHm(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TORONTO_TZ,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function getDayOfWeekInToronto(date: Date) {
  return getDayOfWeekInTimeZone(date, TORONTO_TZ);
}

function toDateOnlyInToronto(date: Date) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  return new Date(`${iso}T00:00:00.000Z`);
}

function shiftDurationHours(startsAt: Date, endsAt: Date) {
  return (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60);
}
