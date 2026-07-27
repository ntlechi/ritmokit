import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { getDayRange } from "@/lib/calendar/grid";
import { prisma } from "@/lib/prisma";
import { calculateCoverageScore } from "@/lib/scheduling/coverage";
import { getStaffingProfilesForLocation } from "@/lib/scheduling/staffing-curve";
import type { StaffingProfileSnapshot } from "@/lib/scheduling/staffing-curve-core";
import type { StationRecord } from "@/lib/stations/display";

export type ManagerScheduleDayPayload = {
  date: string;
  salesByHour: number[];
  laborBuckets: Array<{
    hour: number;
    projectedSales: number;
    actualSales: number | null;
    laborHours: number;
    laborCost: number;
  }>;
};

export type ManagerSchedulePayload =
  | {
      ok: true;
      locationId: string;
      stations: StationRecord[];
      profiles: Record<string, StaffingProfileSnapshot>;
      days: ManagerScheduleDayPayload[];
    }
  | { ok: false; error: "unauthorized" };

export async function getManagerSchedulePayload(
  userId: string,
  userRole: string,
  days: Date[],
): Promise<ManagerSchedulePayload> {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!membership) return { ok: false, error: "unauthorized" };

  const [{ stations, profiles }, dayReports] = await Promise.all([
    getStaffingProfilesForLocation(membership.locationId),
    Promise.all(days.map((day) => calculateCoverageScore({ locationId: membership.locationId, targetDate: day }))),
  ]);

  return {
    ok: true,
    locationId: membership.locationId,
    stations,
    profiles,
    days: dayReports.map((report) => ({
      date: report.targetDate,
      salesByHour: report.laborBuckets.map((b) => b.actualSales ?? b.projectedSales),
      laborBuckets: report.laborBuckets.map((b) => ({
        hour: b.hour,
        projectedSales: b.projectedSales,
        actualSales: b.actualSales,
        laborHours: b.laborHours,
        laborCost: b.laborCost,
      })),
    })),
  };
}

export function getDayBounds(date: Date) {
  return getDayRange(date);
}
