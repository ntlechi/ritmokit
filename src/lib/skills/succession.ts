import "server-only";

import type { SkillLevel } from "@/generated/prisma/enums";
import { getHourInToronto, getNextHourBoundaryInToronto } from "@/lib/finance/labor-kpis";
import { prisma } from "@/lib/prisma";
import { getStationsForLocation } from "@/lib/data/stations";
import { RUSH_HOURS, isLeadOrAbove } from "@/lib/skills/levels";

export type SuccessionGap = {
  stationId: string;
  startHour: number;
  endHour: number;
  scheduledCount: number;
  leadCount: number;
};

/**
 * Détecte les plages de rush où une station a ≥ 2 employés planifiés
 * mais aucun Lead — alerte de succession pour le gérant.
 */
export async function detectSuccessionGaps(input: {
  locationId: string;
  dayStart: Date;
  dayEnd: Date;
}): Promise<SuccessionGap[]> {
  const [stations, shifts] = await Promise.all([
    getStationsForLocation(input.locationId),
    prisma.shift.findMany({
      where: {
        locationId: input.locationId,
        startsAt: { lt: input.dayEnd },
        endsAt: { gt: input.dayStart },
        employeeId: { not: null },
        status: { in: ["DRAFT", "PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] },
      },
      select: { stationId: true, startsAt: true, endsAt: true, employeeId: true },
    }),
  ]);

  if (shifts.length === 0) return [];

  const stationIds = stations.map((s) => s.id);
  const employeeIds = [...new Set(shifts.map((s) => s.employeeId!).filter(Boolean))];
  const skillRows = await prisma.employeeStationSkill.findMany({
    where: {
      locationId: input.locationId,
      userId: { in: employeeIds },
    },
    select: { userId: true, stationId: true, level: true },
  });

  const skillMap = new Map<string, SkillLevel>();
  for (const row of skillRows) {
    skillMap.set(`${row.userId}:${row.stationId}`, row.level);
  }

  type HourBucket = { scheduled: Set<string>; leads: Set<string> };
  const byStationHour: Record<string, HourBucket[]> = {};
  for (const stationId of stationIds) {
    byStationHour[stationId] = Array.from({ length: 24 }, () => ({
      scheduled: new Set(),
      leads: new Set(),
    }));
  }

  for (const shift of shifts) {
    if (!shift.employeeId) continue;
    const start = shift.startsAt < input.dayStart ? input.dayStart : shift.startsAt;
    const end = shift.endsAt > input.dayEnd ? input.dayEnd : shift.endsAt;
    let cursor = new Date(start);
    while (cursor < end) {
      const hour = getHourInToronto(cursor);
      const bucket = byStationHour[shift.stationId]?.[hour];
      if (bucket) {
        bucket.scheduled.add(shift.employeeId);
        const level = skillMap.get(`${shift.employeeId}:${shift.stationId}`);
        if (isLeadOrAbove(level)) {
          bucket.leads.add(shift.employeeId);
        }
      }
      cursor = getNextHourBoundaryInToronto(cursor);
    }
  }

  const gaps: SuccessionGap[] = [];
  for (const stationId of stationIds) {
    let runStart: number | null = null;
    let runScheduled = 0;
    let runLeads = 0;

    const flush = (endHour: number) => {
      if (runStart == null) return;
      gaps.push({
        stationId,
        startHour: runStart,
        endHour,
        scheduledCount: runScheduled,
        leadCount: runLeads,
      });
      runStart = null;
    };

    for (let hour = 0; hour < 24; hour += 1) {
      const bucket = byStationHour[stationId][hour];
      const scheduled = bucket.scheduled.size;
      const leads = bucket.leads.size;
      const isGap = RUSH_HOURS.has(hour) && scheduled >= 2 && leads === 0;

      if (isGap) {
        if (runStart == null) {
          runStart = hour;
          runScheduled = scheduled;
          runLeads = leads;
        } else {
          runScheduled = Math.max(runScheduled, scheduled);
        }
      } else {
        flush(hour);
      }
    }
    flush(24);
  }

  return gaps;
}
