import "server-only";

import { loadDanceAnalyticsForLocation } from "@/lib/dance/analytics";
import { getPrimaryLocationIdForUser, getStationsForLocation } from "@/lib/data/stations";
import type { StationRecord } from "@/lib/stations/display";

export type RoomUsage = {
  /** Scheduled weekly classes in this room. */
  classCount: number;
  /** Paid students across those classes. */
  enrolled: number;
  /** Mean utilization of the room's classes, 0–100. */
  avgUtilizationPct: number | null;
  /** Paid enrollment revenue booked in this room (sum of amountCad). */
  revenue: number;
  /** Net profit booked in this room (revenue − instructor cost). */
  netMargin: number;
  /** Net profit per m² — the room-allocation signal. */
  yieldPerSqm: number | null;
  /** Sum of class hours booked in this room. */
  totalHours: number;
  /** Net profit per booked hour. */
  yieldPerHour: number | null;
  /** Students per weekday index 0=Sun … 6=Sat. */
  byDay: number[];
  /** Distinct dance styles taught in this room. */
  styles: string[];
  /** Busiest hour of the week, or null when the room is unused. */
  peakHour: number | null;
};

export type RoomOverviewEntry = {
  room: StationRecord;
  usage: RoomUsage;
};

export type RoomsOverview = {
  locationId: string;
  rooms: RoomOverviewEntry[];
  totals: {
    roomCount: number;
    totalCapacity: number;
    totalSurfaceSqm: number;
    avgUtilizationPct: number | null;
    classCount: number;
  };
};

const EMPTY_USAGE: RoomUsage = {
  classCount: 0,
  enrolled: 0,
  avgUtilizationPct: null,
  revenue: 0,
  netMargin: 0,
  yieldPerSqm: null,
  totalHours: 0,
  yieldPerHour: null,
  byDay: [0, 0, 0, 0, 0, 0, 0],
  styles: [],
  peakHour: null,
};

export async function getRoomsOverviewForUser(
  userId: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<RoomsOverview | null> {
  const locationId = await getPrimaryLocationIdForUser(userId);
  if (!locationId) return null;

  const [rooms, analytics] = await Promise.all([
    getStationsForLocation(locationId, { activeOnly, kind: "ROOM" }),
    loadDanceAnalyticsForLocation(locationId),
  ]);

  const usageByRoom = new Map<string, RoomUsage>();
  const utilSamples = new Map<string, number[]>();
  const hourTotals = new Map<string, Map<number, number>>();

  for (const row of analytics.classRows) {
    const usage = usageByRoom.get(row.roomId) ?? {
      ...EMPTY_USAGE,
      byDay: [0, 0, 0, 0, 0, 0, 0],
      styles: [],
    };
    usage.classCount += 1;
    usage.enrolled += row.paidCount;
    usage.revenue += row.revenue;
    usage.netMargin += row.grossMargin;
    usage.totalHours += row.hours;
    const style = row.style?.trim();
    if (style && !usage.styles.includes(style)) usage.styles.push(style);
    usageByRoom.set(row.roomId, usage);

    const samples = utilSamples.get(row.roomId) ?? [];
    samples.push(row.utilizationPct);
    utilSamples.set(row.roomId, samples);
  }

  for (const cell of analytics.heatmap) {
    const usage = usageByRoom.get(cell.roomId);
    if (!usage) continue;
    usage.byDay[cell.dayOfWeek] += cell.enrolled;

    const hours = hourTotals.get(cell.roomId) ?? new Map<number, number>();
    hours.set(cell.hour, (hours.get(cell.hour) ?? 0) + cell.enrolled);
    hourTotals.set(cell.roomId, hours);
  }

  const entries: RoomOverviewEntry[] = rooms.map((room) => {
    const usage = usageByRoom.get(room.id);
    if (!usage) return { room, usage: { ...EMPTY_USAGE, byDay: [0, 0, 0, 0, 0, 0, 0], styles: [] } };

    const samples = utilSamples.get(room.id) ?? [];
    usage.avgUtilizationPct =
      samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : null;

    usage.yieldPerSqm =
      room.surfaceSqm && room.surfaceSqm > 0
        ? Math.round((usage.netMargin / room.surfaceSqm) * 100) / 100
        : null;

    usage.yieldPerHour =
      usage.totalHours > 0
        ? Math.round((usage.netMargin / usage.totalHours) * 100) / 100
        : null;

    const hours = hourTotals.get(room.id);
    if (hours && hours.size > 0) {
      usage.peakHour = [...hours.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    usage.styles.sort((a, b) => a.localeCompare(b));
    return { room, usage };
  });

  const utilised = entries
    .map((entry) => entry.usage.avgUtilizationPct)
    .filter((value): value is number => value != null);

  return {
    locationId,
    rooms: entries,
    totals: {
      roomCount: entries.length,
      totalCapacity: entries.reduce((sum, e) => sum + (e.room.capacity ?? 0), 0),
      totalSurfaceSqm: entries.reduce((sum, e) => sum + (e.room.surfaceSqm ?? 0), 0),
      avgUtilizationPct:
        utilised.length > 0 ? utilised.reduce((a, b) => a + b, 0) / utilised.length : null,
      classCount: entries.reduce((sum, e) => sum + e.usage.classCount, 0),
    },
  };
}
