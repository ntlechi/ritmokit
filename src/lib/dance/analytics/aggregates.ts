import { calculateClassEconomics } from "@/lib/dance/class-economics";
import { getClassAvailability, type RoleCapacity } from "@/lib/dance/parity";
import {
  enrollmentRevenueCad,
  waitlistExpectedAmountCad,
  type PricingTier,
} from "@/lib/dance/pricing";
import type {
  ChurnRiskStudent,
  ClassEconomicsRow,
  DanceAnalyticsBundle,
  HeatmapCell,
  ParitySnapshot,
  ProgressionFunnel,
} from "@/lib/dance/analytics/types";

export type RawClassForAnalytics = {
  id: string;
  dayOfWeek: number | null;
  startTime: Date;
  endTime: Date;
  maxLeads: number;
  maxFollows: number;
  priceRegular: number;
  priceCouple: number | null;
  priceStudent: number | null;
  courseTitle: string;
  style: string;
  level: string;
  roomId: string;
  roomName: string;
  surfaceSqm: number | null;
  roomCapacity: number | null;
  instructorId: string;
  instructorName: string;
  payType: ClassEconomicsRow["payType"];
  payRate: number | null;
  enrollments: Array<{
    danceRole: "LEAD" | "FOLLOW" | "SOLO";
    paid: boolean;
    paymentStatus?: string | null;
    waitlisted: boolean;
    attended: boolean;
    amountCad?: number | null;
    pricingTier?: PricingTier | null;
    studentId: string;
    studentName: string;
    studentEmail: string;
  }>;
};

const HEATMAP_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] as const;

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
}

function sessionPrices(row: RawClassForAnalytics) {
  return {
    priceRegular: row.priceRegular,
    priceCouple: row.priceCouple,
    priceStudent: row.priceStudent,
  };
}

export function buildClassEconomicsRows(raw: RawClassForAnalytics[]): ClassEconomicsRow[] {
  return raw.map((row) => {
    let leadsFilled = 0;
    let followsFilled = 0;
    let paidCount = 0;
    let waitlistedCount = 0;
    let attendees = 0;
    let revenue = 0;
    let waitlistBlockedRevenue = 0;
    const prices = sessionPrices(row);

    for (const e of row.enrollments) {
      if (e.waitlisted) {
        waitlistedCount += 1;
        waitlistBlockedRevenue += waitlistExpectedAmountCad(e, prices);
        continue;
      }
      if (e.danceRole === "LEAD") leadsFilled += 1;
      else if (e.danceRole === "FOLLOW") followsFilled += 1;

      const seatRevenue = enrollmentRevenueCad(e, prices);
      if (seatRevenue != null) {
        paidCount += 1;
        revenue += seatRevenue;
      }
      if (e.attended) attendees += 1;
    }

    const hours = hoursBetween(row.startTime, row.endTime);
    const economics = calculateClassEconomics({
      revenue: Math.round(revenue * 100) / 100,
      paidEnrollmentCount: paidCount,
      pricePerStudent: row.priceRegular,
      payType: row.payType,
      payRate: row.payRate,
      hours,
      attendees: attendees || paidCount,
      surfaceSqm: row.surfaceSqm,
    });

    const seatCapacity = row.maxLeads + row.maxFollows;
    const seated = leadsFilled + followsFilled;
    const utilizationPct =
      seatCapacity > 0 ? Math.round((seated / seatCapacity) * 1000) / 10 : 0;

    const cap: RoleCapacity = {
      maxLeads: row.maxLeads,
      maxFollows: row.maxFollows,
      filledLeads: leadsFilled,
      filledFollows: followsFilled,
    };

    return {
      sessionId: row.id,
      courseTitle: row.courseTitle,
      style: row.style,
      level: row.level,
      roomId: row.roomId,
      roomName: row.roomName,
      surfaceSqm: row.surfaceSqm,
      instructorId: row.instructorId,
      instructorName: row.instructorName,
      dayOfWeek: row.dayOfWeek,
      startTimeIso: row.startTime.toISOString(),
      endTimeIso: row.endTime.toISOString(),
      paidCount,
      waitlistedCount,
      leadsFilled,
      followsFilled,
      maxLeads: row.maxLeads,
      maxFollows: row.maxFollows,
      imbalance: getClassAvailability(cap).imbalance,
      priceRegular: row.priceRegular,
      revenue: economics.revenue,
      instructorCost: economics.instructorCost,
      grossMargin: economics.grossMargin,
      roomYieldPerSqm: economics.roomYieldPerSqm,
      waitlistBlockedRevenue: Math.round(waitlistBlockedRevenue * 100) / 100,
      utilizationPct,
      hours,
      payType: row.payType,
    };
  });
}

export function buildParitySnapshots(rows: ClassEconomicsRow[]): ParitySnapshot[] {
  return rows.map((row) => {
    const blockedFollows = Math.max(0, row.followsFilled - row.leadsFilled - 2);
    const blockedLeads = Math.max(0, row.leadsFilled - row.followsFilled - 2);
    const imbalanceBlockedSeats = blockedFollows + blockedLeads;
    // Real waitlist CAD + theoretical parity pressure at regular price.
    const blockedRevenue =
      row.waitlistBlockedRevenue + imbalanceBlockedSeats * row.priceRegular;
    let status: ParitySnapshot["status"] = "balanced";
    if (row.waitlistedCount > 0 || row.imbalance > 2) status = "blocked";
    else if (row.imbalance >= 1) status = "warning";

    return {
      sessionId: row.sessionId,
      courseTitle: row.courseTitle,
      leadsFilled: row.leadsFilled,
      followsFilled: row.followsFilled,
      maxLeads: row.maxLeads,
      maxFollows: row.maxFollows,
      imbalance: row.imbalance,
      waitlistedCount: row.waitlistedCount,
      blockedRevenue: Math.round(blockedRevenue * 100) / 100,
      status,
    };
  });
}

export function buildRoomHeatmap(raw: RawClassForAnalytics[]): HeatmapCell[] {
  const cells = new Map<string, HeatmapCell>();
  const rooms = new Map<string, { name: string; capacity: number }>();

  for (const row of raw) {
    const capacity =
      row.roomCapacity && row.roomCapacity > 0
        ? row.roomCapacity
        : row.maxLeads + row.maxFollows;
    if (!rooms.has(row.roomId)) {
      rooms.set(row.roomId, { name: row.roomName, capacity });
    }
  }

  // Seed empty grid so dead zones (weekday afternoons) are visible.
  for (const [roomId, room] of rooms) {
    for (let day = 0; day <= 6; day += 1) {
      for (const hour of HEATMAP_HOURS) {
        const key = `${roomId}:${day}:${hour}`;
        cells.set(key, {
          roomId,
          roomName: room.name,
          dayOfWeek: day,
          hour,
          enrolled: 0,
          capacity: room.capacity,
          utilizationPct: 0,
          sessionIds: [],
        });
      }
    }
  }

  for (const row of raw) {
    if (row.dayOfWeek == null) continue;
    const hour = row.startTime.getHours();
    if (!(HEATMAP_HOURS as readonly number[]).includes(hour)) continue;
    const key = `${row.roomId}:${row.dayOfWeek}:${hour}`;
    const seated = row.enrollments.filter((e) => !e.waitlisted).length;
    const capacity =
      row.roomCapacity && row.roomCapacity > 0
        ? row.roomCapacity
        : row.maxLeads + row.maxFollows;
    const existing = cells.get(key);
    if (!existing) {
      cells.set(key, {
        roomId: row.roomId,
        roomName: row.roomName,
        dayOfWeek: row.dayOfWeek,
        hour,
        enrolled: seated,
        capacity,
        utilizationPct: capacity > 0 ? Math.round((seated / capacity) * 1000) / 10 : 0,
        sessionIds: [row.id],
      });
    } else {
      existing.enrolled += seated;
      existing.capacity = Math.max(existing.capacity, capacity);
      existing.utilizationPct =
        existing.capacity > 0
          ? Math.round((existing.enrolled / existing.capacity) * 1000) / 10
          : 0;
      existing.sessionIds.push(row.id);
    }
  }

  return Array.from(cells.values()).sort(
    (a, b) =>
      a.roomName.localeCompare(b.roomName) || a.dayOfWeek - b.dayOfWeek || a.hour - b.hour,
  );
}

export function buildProgressionFunnel(raw: RawClassForAnalytics[]): ProgressionFunnel {
  const byLevel = {
    BEGINNER: new Set<string>(),
    INTERMEDIATE: new Set<string>(),
    ADVANCED: new Set<string>(),
  };

  for (const row of raw) {
    const level = row.level as keyof typeof byLevel;
    if (!(level in byLevel)) continue;
    for (const e of row.enrollments) {
      if (!e.waitlisted) byLevel[level].add(e.studentId);
    }
  }

  const beginnerCompleters = byLevel.BEGINNER.size;
  const intermediateEnrolled = byLevel.INTERMEDIATE.size;
  const advancedEnrolled = byLevel.ADVANCED.size;

  // Approximation until multi-season cohort tracking: overlap of L1 students also in L2
  let l1InL2 = 0;
  for (const id of byLevel.BEGINNER) {
    if (byLevel.INTERMEDIATE.has(id)) l1InL2 += 1;
  }
  let l2InL3 = 0;
  for (const id of byLevel.INTERMEDIATE) {
    if (byLevel.ADVANCED.has(id)) l2InL3 += 1;
  }

  return {
    beginnerCompleters,
    intermediateEnrolled,
    advancedEnrolled,
    l1ToL2Rate:
      beginnerCompleters > 0 ? Math.round((l1InL2 / beginnerCompleters) * 1000) / 10 : null,
    l2ToL3Rate:
      intermediateEnrolled > 0
        ? Math.round((l2InL3 / intermediateEnrolled) * 1000) / 10
        : null,
  };
}

/**
 * Attendance churn risk watchlist.
 * Proxy for "below 60% over 3 consecutive weeks" until week-series attendance exists:
 * paid enrollments that were never marked attended.
 */
export function buildChurnRiskStudents(raw: RawClassForAnalytics[]): ChurnRiskStudent[] {
  const map = new Map<string, ChurnRiskStudent>();
  for (const row of raw) {
    for (const e of row.enrollments) {
      const isPaid = e.paid || e.paymentStatus === "PAID";
      if (e.waitlisted || e.attended || !isPaid) continue;
      const prev = map.get(e.studentId);
      if (!prev) {
        map.set(e.studentId, {
          studentId: e.studentId,
          fullName: e.studentName,
          email: e.studentEmail,
          unpaidAttendanceMisses: 1,
          courseTitles: [row.courseTitle],
        });
      } else {
        prev.unpaidAttendanceMisses += 1;
        if (!prev.courseTitles.includes(row.courseTitle)) {
          prev.courseTitles.push(row.courseTitle);
        }
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.unpaidAttendanceMisses - a.unpaidAttendanceMisses || a.fullName.localeCompare(b.fullName),
  );
}

export function countChurnRisk(raw: RawClassForAnalytics[]): number {
  return buildChurnRiskStudents(raw).length;
}

export function aggregateDanceAnalytics(
  locationId: string,
  raw: RawClassForAnalytics[],
): DanceAnalyticsBundle {
  const classRows = buildClassEconomicsRows(raw);
  const parity = buildParitySnapshots(classRows);
  const heatmap = buildRoomHeatmap(raw);
  const progression = buildProgressionFunnel(raw);
  const churnRiskStudents = buildChurnRiskStudents(raw);

  const classCount = classRows.length;
  const totalUtil = classRows.reduce((s, r) => s + r.utilizationPct, 0);
  const yieldRows = classRows.filter((r) => r.roomYieldPerSqm != null);
  const totalYield = yieldRows.reduce((s, r) => s + (r.roomYieldPerSqm ?? 0), 0);
  const totalDelta = classRows.reduce((s, r) => s + r.imbalance, 0);
  const blockedRevenue = parity.reduce((s, r) => s + r.blockedRevenue, 0);
  const totalMargin = classRows.reduce((s, r) => s + r.grossMargin, 0);
  const totalRevenue = classRows.reduce((s, r) => s + r.revenue, 0);
  const totalPayroll = classRows.reduce((s, r) => s + r.instructorCost, 0);
  const paidEnrollmentCount = classRows.reduce((s, r) => s + r.paidCount, 0);

  return {
    locationId,
    classRows,
    parity,
    heatmap,
    progression,
    churnRiskStudents,
    aggregates: {
      floorUtilizationPct:
        classCount > 0 ? Math.round((totalUtil / classCount) * 10) / 10 : null,
      avgYieldPerSqm:
        yieldRows.length > 0 ? Math.round((totalYield / yieldRows.length) * 100) / 100 : null,
      avgLeadFollowDelta:
        classCount > 0 ? Math.round((totalDelta / classCount) * 10) / 10 : null,
      blockedRevenue: Math.round(blockedRevenue * 100) / 100,
      avgNetProfitPerClass:
        classCount > 0 ? Math.round((totalMargin / classCount) * 100) / 100 : null,
      payrollToRevenuePct:
        totalRevenue > 0 ? Math.round((totalPayroll / totalRevenue) * 1000) / 10 : null,
      churnRiskCount: churnRiskStudents.length,
      classCount,
      paidEnrollmentCount,
    },
  };
}
