import type { DanceClassRow } from "@/lib/data/dance-admin";

export type SessionConflict = {
  sessionId: string;
  kind: "instructor" | "room";
  withSessionId: string;
};

function overlaps(a: DanceClassRow, b: DanceClassRow): boolean {
  if (a.id === b.id) return false;
  // Same weekday (or both one-off on same calendar day)
  if (a.dayOfWeek != null && b.dayOfWeek != null && a.dayOfWeek !== b.dayOfWeek) {
    return false;
  }
  if (a.dayOfWeek == null || b.dayOfWeek == null) {
    const aDay = a.startTime.slice(0, 10);
    const bDay = b.startTime.slice(0, 10);
    if (aDay !== bDay) return false;
  }
  const aStart = new Date(a.startTime).getTime();
  const aEnd = new Date(a.endTime).getTime();
  const bStart = new Date(b.startTime).getTime();
  const bEnd = new Date(b.endTime).getTime();
  return aStart < bEnd && bStart < aEnd;
}

/** Detect double-booked instructors and rooms across the class list. */
export function findSessionConflicts(classes: DanceClassRow[]): Map<string, SessionConflict[]> {
  const byId = new Map<string, SessionConflict[]>();

  function push(conflict: SessionConflict) {
    const list = byId.get(conflict.sessionId) ?? [];
    list.push(conflict);
    byId.set(conflict.sessionId, list);
  }

  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = classes[i]!;
      const b = classes[j]!;
      if (!overlaps(a, b)) continue;
      if (a.instructorId === b.instructorId) {
        push({ sessionId: a.id, kind: "instructor", withSessionId: b.id });
        push({ sessionId: b.id, kind: "instructor", withSessionId: a.id });
      }
      if (a.roomId === b.roomId) {
        push({ sessionId: a.id, kind: "room", withSessionId: b.id });
        push({ sessionId: b.id, kind: "room", withSessionId: a.id });
      }
    }
  }

  return byId;
}

export function hasInstructorConflict(
  conflicts: Map<string, SessionConflict[]> | undefined,
  sessionId: string,
): boolean {
  return Boolean(conflicts?.get(sessionId)?.some((c) => c.kind === "instructor"));
}

export function hasRoomConflict(
  conflicts: Map<string, SessionConflict[]> | undefined,
  sessionId: string,
): boolean {
  return Boolean(conflicts?.get(sessionId)?.some((c) => c.kind === "room"));
}
