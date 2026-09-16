import "server-only";

import { prisma } from "@/lib/prisma";

export type SlotConflictKind = "room" | "instructor" | "assistant";

function clockOverlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const a0 = aStart.getUTCHours() * 60 + aStart.getUTCMinutes();
  const a1 = aEnd.getUTCHours() * 60 + aEnd.getUTCMinutes();
  const b0 = bStart.getUTCHours() * 60 + bStart.getUTCMinutes();
  const b1 = bEnd.getUTCHours() * 60 + bEnd.getUTCMinutes();
  return a0 < b1 && b0 < a1;
}

function sameSlotDay(
  aDay: number | null,
  aStart: Date,
  bDay: number | null,
  bStart: Date,
): boolean {
  if (aDay != null && bDay != null) return aDay === bDay;
  if (aDay == null && bDay == null) {
    return aStart.toISOString().slice(0, 10) === bStart.toISOString().slice(0, 10);
  }
  return false;
}

/**
 * Hard-block a class create/update when the room or a staffer is already booked
 * on the same weekday (or the same one-off date).
 */
export async function findClassSlotConflict(input: {
  roomId: string;
  instructorId: string;
  assistantId?: string | null;
  dayOfWeek?: number | null;
  startTime: Date;
  endTime: Date;
  excludeSessionId?: string;
}): Promise<SlotConflictKind | null> {
  const staffIds = [input.instructorId, input.assistantId].filter(
    (id): id is string => Boolean(id),
  );

  const rows = await prisma.classSession.findMany({
    where: {
      ...(input.excludeSessionId ? { id: { not: input.excludeSessionId } } : {}),
      OR: [
        { roomId: input.roomId },
        { instructorId: { in: staffIds } },
        { assistantId: { in: staffIds } },
      ],
    },
    select: {
      id: true,
      roomId: true,
      instructorId: true,
      assistantId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
    },
  });

  for (const row of rows) {
    if (!sameSlotDay(input.dayOfWeek ?? null, input.startTime, row.dayOfWeek, row.startTime)) {
      continue;
    }
    if (!clockOverlaps(input.startTime, input.endTime, row.startTime, row.endTime)) continue;
    if (row.roomId === input.roomId) return "room";
    const rowStaff = [row.instructorId, row.assistantId].filter(Boolean);
    if (rowStaff.includes(input.instructorId)) return "instructor";
    if (input.assistantId && rowStaff.includes(input.assistantId)) return "assistant";
  }

  return null;
}

export function slotConflictError(kind: SlotConflictKind): string {
  if (kind === "room") return "room_conflict";
  if (kind === "assistant") return "assistant_conflict";
  return "instructor_conflict";
}
