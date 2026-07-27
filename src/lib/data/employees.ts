import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { asPlainNumber } from "./serialize";

type EmployeeRosterRaw = Prisma.EmployeeProfileGetPayload<{
  include: { user: true };
}>;

/** Client-safe roster row — Prisma Decimal fields are plain numbers. */
export type EmployeeRosterEntry = Omit<EmployeeRosterRaw, "hourlyRate"> & {
  hourlyRate: number | null;
};

function serializeRosterEntry(
  entry: EmployeeRosterRaw,
  options?: { includeHourlyRate?: boolean },
): EmployeeRosterEntry {
  const includeRate = options?.includeHourlyRate !== false;
  return {
    ...entry,
    hourlyRate: includeRate ? asPlainNumber(entry.hourlyRate) : null,
  };
}

/** Location-scoped roster — never omit `locationId` (tenant boundary). */
export async function getEmployeeRoster(
  locationId: string,
  options?: { includeHourlyRate?: boolean },
): Promise<EmployeeRosterEntry[]> {
  const members = await prisma.locationMember.findMany({
    where: { locationId },
    select: { userId: true },
  });
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return [];

  const rows = await prisma.employeeProfile.findMany({
    where: { userId: { in: userIds } },
    include: { user: true },
    orderBy: { user: { fullName: "asc" } },
  });
  return rows.map((row) => serializeRosterEntry(row, options));
}
