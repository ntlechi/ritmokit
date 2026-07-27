import type { ShiftWithEmployee } from "@/lib/data/shifts";

export const TIMELINE_START_HOUR = 6;
export const TIMELINE_END_HOUR = 23;
export const TIMELINE_TOTAL_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;

export interface LanedShift {
  shift: ShiftWithEmployee;
  lane: number;
  leftPct: number;
  widthPct: number;
}

function minutesFromTimelineStart(date: Date, dayStart: Date): number {
  const start = new Date(dayStart);
  start.setHours(TIMELINE_START_HOUR, 0, 0, 0);
  return (date.getTime() - start.getTime()) / (1000 * 60);
}

/** Greedy interval lane assignment so overlapping shifts render on separate rows. */
export function layoutTimeline(shifts: ShiftWithEmployee[], dayStart: Date): {
  lanes: LanedShift[];
  laneCount: number;
} {
  const sorted = [...shifts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const laneEndTimes: number[] = [];
  const lanes: LanedShift[] = [];

  for (const shift of sorted) {
    const startMin = Math.max(0, minutesFromTimelineStart(shift.startsAt, dayStart));
    const endMin = Math.min(
      TIMELINE_TOTAL_MINUTES,
      minutesFromTimelineStart(shift.endsAt, dayStart),
    );
    if (endMin <= 0 || startMin >= TIMELINE_TOTAL_MINUTES) continue;

    let lane = laneEndTimes.findIndex((end) => end <= startMin);
    if (lane === -1) {
      lane = laneEndTimes.length;
      laneEndTimes.push(endMin);
    } else {
      laneEndTimes[lane] = endMin;
    }

    lanes.push({
      shift,
      lane,
      leftPct: (startMin / TIMELINE_TOTAL_MINUTES) * 100,
      widthPct: ((endMin - startMin) / TIMELINE_TOTAL_MINUTES) * 100,
    });
  }

  return { lanes, laneCount: Math.max(1, laneEndTimes.length) };
}

export function getHourMarks(): number[] {
  return Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, i) => TIMELINE_START_HOUR + i,
  );
}
