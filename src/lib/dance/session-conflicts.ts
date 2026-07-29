import type { DanceClassRow } from "@/lib/data/dance-admin";

export type SessionConflict = {
  sessionId: string;
  kind: "instructor" | "assistant" | "room";
  withSessionId: string;
};

function overlaps(a: DanceClassRow, b: DanceClassRow): boolean {
  if (a.id === b.id) return false;
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

/** All user IDs a person is staffing on a session (primary and/or assistant). */
function staffIds(cls: DanceClassRow): string[] {
  const ids = [cls.instructorId];
  if (cls.assistantId) ids.push(cls.assistantId);
  return ids;
}

/**
 * Detect double-booked staff and rooms.
 * Flags when the same person is primary in one room and assistant in another
 * at the same hour (or any overlapping staff assignment).
 */
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

      if (a.roomId === b.roomId) {
        push({ sessionId: a.id, kind: "room", withSessionId: b.id });
        push({ sessionId: b.id, kind: "room", withSessionId: a.id });
      }

      const aStaff = staffIds(a);
      const bStaff = staffIds(b);
      for (const personId of aStaff) {
        if (!bStaff.includes(personId)) continue;
        const aAsAssistant = a.assistantId === personId;
        const bAsAssistant = b.assistantId === personId;
        const kind: SessionConflict["kind"] =
          aAsAssistant || bAsAssistant ? "assistant" : "instructor";
        push({ sessionId: a.id, kind, withSessionId: b.id });
        push({ sessionId: b.id, kind, withSessionId: a.id });
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

export function hasAssistantConflict(
  conflicts: Map<string, SessionConflict[]> | undefined,
  sessionId: string,
): boolean {
  return Boolean(conflicts?.get(sessionId)?.some((c) => c.kind === "assistant"));
}

export function hasStaffConflict(
  conflicts: Map<string, SessionConflict[]> | undefined,
  sessionId: string,
): boolean {
  return Boolean(
    conflicts?.get(sessionId)?.some((c) => c.kind === "instructor" || c.kind === "assistant"),
  );
}

export function hasRoomConflict(
  conflicts: Map<string, SessionConflict[]> | undefined,
  sessionId: string,
): boolean {
  return Boolean(conflicts?.get(sessionId)?.some((c) => c.kind === "room"));
}
