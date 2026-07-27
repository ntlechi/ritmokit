import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { StationRecord } from "@/lib/stations/display";
import { asPlainNumber } from "./serialize";

type ShiftWithEmployeeRaw = Prisma.ShiftGetPayload<{
  include: {
    employee: { include: { employeeProfile: true } };
    station: true;
  };
}>;

type EmployeeWithProfileRaw = NonNullable<ShiftWithEmployeeRaw["employee"]>;
type EmployeeProfileRaw = NonNullable<EmployeeWithProfileRaw["employeeProfile"]>;

type ClientEmployeeProfile = Omit<EmployeeProfileRaw, "hourlyRate"> & { hourlyRate: number | null };
type ClientEmployee = Omit<EmployeeWithProfileRaw, "employeeProfile"> & {
  employeeProfile: ClientEmployeeProfile | null;
};

/** Client-safe shift row — Prisma Decimal fields are plain numbers. */
export type ShiftWithEmployee = Omit<
  ShiftWithEmployeeRaw,
  "weeklyHoursSnapshot" | "surgeBonus" | "employee" | "station"
> & {
  weeklyHoursSnapshot: number;
  surgeBonus: number | null;
  employee: ClientEmployee | null;
  station: StationRecord;
};

const withEmployee = {
  employee: { include: { employeeProfile: true } },
  station: true,
} satisfies Prisma.ShiftInclude;

function mapStation(row: NonNullable<ShiftWithEmployeeRaw["station"]>): StationRecord {
  return {
    id: row.id,
    locationId: row.locationId,
    nameFr: row.nameFr,
    nameEn: row.nameEn,
    nameEs: row.nameEs,
    colorHex: row.colorHex,
    slug: row.slug,
    sortOrder: row.sortOrder,
    tipPoints: asPlainNumber(row.tipPoints),
    isActive: row.isActive,
  };
}

function serializeShift(
  shift: ShiftWithEmployeeRaw,
  options?: { includeHourlyRate?: boolean },
): ShiftWithEmployee {
  const includeRate = options?.includeHourlyRate !== false;
  const employee = shift.employee
    ? {
        ...shift.employee,
        employeeProfile: shift.employee.employeeProfile
          ? {
              ...shift.employee.employeeProfile,
              hourlyRate: includeRate
                ? asPlainNumber(shift.employee.employeeProfile.hourlyRate)
                : null,
            }
          : null,
      }
    : null;

  const { station: stationRow, ...rest } = shift;

  return {
    ...rest,
    weeklyHoursSnapshot: asPlainNumber(shift.weeklyHoursSnapshot),
    surgeBonus: shift.surgeBonus != null ? asPlainNumber(shift.surgeBonus) : null,
    employee,
    station: mapStation(stationRow),
  };
}

function serializeShifts(
  shifts: ShiftWithEmployeeRaw[],
  options?: { includeHourlyRate?: boolean },
): ShiftWithEmployee[] {
  return shifts.map((s) => serializeShift(s, options));
}

/** Location-scoped shift range — never omit `locationId` (tenant boundary). */
export async function getShiftsInRange(
  start: Date,
  end: Date,
  locationId: string,
  options?: { includeHourlyRate?: boolean },
): Promise<ShiftWithEmployee[]> {
  const rows = await prisma.shift.findMany({
    where: { locationId, startsAt: { gte: start, lt: end } },
    include: withEmployee,
    orderBy: { startsAt: "asc" },
  });
  return serializeShifts(rows, options);
}

/** Own-shift queries — station only (caller already knows the employee). */
const withStationOnly = {
  station: true,
} satisfies Prisma.ShiftInclude;

type ShiftWithStationRaw = Prisma.ShiftGetPayload<{ include: typeof withStationOnly }>;

function serializeOwnShift(shift: ShiftWithStationRaw): ShiftWithEmployee {
  const { station: stationRow, ...rest } = shift;
  return {
    ...rest,
    weeklyHoursSnapshot: asPlainNumber(shift.weeklyHoursSnapshot),
    surgeBonus: shift.surgeBonus != null ? asPlainNumber(shift.surgeBonus) : null,
    employee: null,
    station: mapStation(stationRow),
  };
}

export async function getShiftsForEmployee(
  employeeId: string,
  start: Date,
  end: Date,
): Promise<ShiftWithEmployee[]> {
  const rows = await prisma.shift.findMany({
    where: { employeeId, startsAt: { gte: start, lt: end } },
    include: withStationOnly,
    orderBy: { startsAt: "asc" },
  });
  return rows.map(serializeOwnShift);
}

export async function getUpcomingShiftsForEmployee(employeeId: string): Promise<ShiftWithEmployee[]> {
  const rows = await prisma.shift.findMany({
    where: { employeeId, startsAt: { gte: new Date() } },
    include: withStationOnly,
    orderBy: { startsAt: "asc" },
    take: 20,
  });
  return rows.map(serializeOwnShift);
}
