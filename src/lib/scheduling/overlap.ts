import "server-only";

import { prisma } from "@/lib/prisma";
import { intervalsOverlap } from "@/lib/time/cnesst-week";

/**
 * True if `userId` already has a non-REJECTED shift overlapping [startsAt, endsAt).
 * Shared by crisis-shift eligibility, drag-drop reassignment, and template apply.
 */
export async function hasEmployeeShiftConflict(
  userId: string,
  startsAt: Date,
  endsAt: Date,
  excludeShiftId?: string,
): Promise<boolean> {
  const conflict = await prisma.shift.findFirst({
    where: {
      employeeId: userId,
      status: { notIn: ["REJECTED"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      id: excludeShiftId ? { not: excludeShiftId } : undefined,
    },
    select: { id: true },
  });
  return conflict !== null;
}

/** In-memory overlap against rows about to be inserted in the same batch. */
export function hasBatchShiftConflict(
  rows: Array<{ employeeId: string | null; startsAt: Date; endsAt: Date }>,
  candidate: { employeeId: string; startsAt: Date; endsAt: Date },
): boolean {
  return rows.some(
    (row) =>
      row.employeeId === candidate.employeeId &&
      intervalsOverlap(row.startsAt, row.endsAt, candidate.startsAt, candidate.endsAt),
  );
}
