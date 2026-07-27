import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const PUNCH_ADMIN_WINDOW_DAYS = 14;
/** Grace period before a missing clock event is flagged — avoids nagging about a shift that just ended. */
const GRACE_MINUTES = 15;

export type PunchRowStatus = "ok" | "missing_in" | "missing_out" | "upcoming" | "in_progress";

export type ManagerPunchRow = {
  shiftId: string;
  employeeId: string | null;
  employeeName: string;
  stationNameFr: string;
  stationColorHex: string;
  startsAt: string;
  endsAt: string;
  actualStartsAt: string | null;
  actualEndsAt: string | null;
  breakStartedAt: string | null;
  breakEndedAt: string | null;
  status: PunchRowStatus;
};

export type ManagerPunchReport = {
  locationId: string;
  locationName: string;
  windowDays: number;
  rows: ManagerPunchRow[];
  missingCount: number;
};

function deriveStatus(row: {
  startsAt: Date;
  endsAt: Date;
  actualStartsAt: Date | null;
  actualEndsAt: Date | null;
}): PunchRowStatus {
  const now = Date.now();
  const graceMs = GRACE_MINUTES * 60 * 1000;

  if (row.startsAt.getTime() > now) return "upcoming";
  if (!row.actualStartsAt) {
    return now - row.startsAt.getTime() > graceMs ? "missing_in" : "upcoming";
  }
  if (!row.actualEndsAt) {
    return now - row.endsAt.getTime() > graceMs ? "missing_out" : "in_progress";
  }
  return "ok";
}

export async function getManagerPunchesForUser(userId: string, userRole: string) {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
  if (!membership) return { ok: false as const, error: "unauthorized" as const };

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - PUNCH_ADMIN_WINDOW_DAYS);
  const windowEnd = new Date();
  windowEnd.setHours(windowEnd.getHours() + 6);

  const shifts = await prisma.shift.findMany({
    where: {
      locationId: membership.locationId,
      status: { notIn: ["DRAFT", "REJECTED"] },
      employeeId: { not: null },
      startsAt: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { startsAt: "desc" },
    include: {
      employee: { select: { id: true, fullName: true } },
      station: { select: { nameFr: true, colorHex: true } },
    },
    take: 300,
  });

  const rows: ManagerPunchRow[] = shifts.map((shift) => ({
    shiftId: shift.id,
    employeeId: shift.employeeId,
    employeeName: shift.employee?.fullName ?? "—",
    stationNameFr: shift.station.nameFr,
    stationColorHex: shift.station.colorHex,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    actualStartsAt: shift.actualStartsAt?.toISOString() ?? null,
    actualEndsAt: shift.actualEndsAt?.toISOString() ?? null,
    breakStartedAt: shift.breakStartedAt?.toISOString() ?? null,
    breakEndedAt: shift.breakEndedAt?.toISOString() ?? null,
    status: deriveStatus(shift),
  }));

  return {
    ok: true as const,
    data: {
      locationId: membership.locationId,
      locationName: membership.location.name,
      windowDays: PUNCH_ADMIN_WINDOW_DAYS,
      rows,
      missingCount: rows.filter((r) => r.status === "missing_in" || r.status === "missing_out").length,
    } satisfies ManagerPunchReport,
  };
}
