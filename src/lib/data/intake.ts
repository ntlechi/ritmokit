import "server-only";

import { prisma } from "@/lib/prisma";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import {
  INTAKE_BOARD_ORDER,
  isFirstVisit,
  OPEN_INTAKE_STATUSES,
  type IntakeStatusValue,
} from "@/lib/dance/intake-rules";

export const INTAKE_PAGE_SIZE = 30;

const STAFF_ROLES = ["OWNER", "MANAGER", "ADMIN", "INSTRUCTOR", "FRONT_DESK"] as const;

export type IntakeRow = {
  id: string;
  status: IntakeStatusValue;
  source: "WEBSITE" | "DOOR" | "STAFF";
  createdAt: string;
  contactedAt: string | null;
  firstAttendedAt: string | null;
  assignedToId: string | null;
  student: { id: string; fullName: string; email: string; phone: string | null };
  firstClass: {
    courseTitle: string;
    style: string;
    level: string;
    dayOfWeek: number | null;
    startTime: string;
    /** Seat state for this student in the first class, when still enrolled. */
    seat: {
      paid: boolean;
      waitlisted: boolean;
      pendingInterac: boolean;
      danceRole: "LEAD" | "FOLLOW" | "SOLO";
    } | null;
  } | null;
};

export type IntakePage = {
  rows: IntakeRow[];
  nextCursor: string | null;
};

export type IntakeStaffOption = { id: string; fullName: string };

export async function countIntakeByStatus(
  locationId: string,
): Promise<Record<IntakeStatusValue, number>> {
  await ensureStudioOsSchema();
  const grouped = await prisma.studentIntake.groupBy({
    by: ["status"],
    where: { locationId },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(INTAKE_BOARD_ORDER.map((s) => [s, 0])) as Record<
    IntakeStatusValue,
    number
  >;
  for (const row of grouped) counts[row.status] = row._count._all;
  return counts;
}

/** Sidebar badges: open intakes + Interac awaiting confirmation. */
export async function getNavBadges(
  locationId: string,
): Promise<{ studentsNew: number; interac: number }> {
  await ensureStudioOsSchema();
  const [studentsNew, interac] = await Promise.all([
    prisma.studentIntake.count({
      where: { locationId, status: { in: [...OPEN_INTAKE_STATUSES] } },
    }),
    prisma.enrollment.count({
      where: {
        waitlisted: false,
        paymentStatus: "PENDING_INTERAC",
        session: {
          OR: [
            { season: { locationId } },
            { seasonId: null, room: { locationId } },
          ],
        },
      },
    }),
  ]);
  return { studentsNew, interac };
}

export async function listIntakes(
  locationId: string,
  statuses: readonly IntakeStatusValue[],
  options?: { cursor?: string | null; take?: number },
): Promise<IntakePage> {
  await ensureStudioOsSchema();
  const take = options?.take ?? INTAKE_PAGE_SIZE;

  const intakes = await prisma.studentIntake.findMany({
    where: { locationId, status: { in: [...statuses] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      source: true,
      createdAt: true,
      contactedAt: true,
      firstAttendedAt: true,
      assignedToId: true,
      firstSessionId: true,
      student: { select: { id: true, fullName: true, email: true, phone: true } },
      firstSession: {
        select: {
          dayOfWeek: true,
          startTime: true,
          course: { select: { title: true, style: true, level: true } },
        },
      },
    },
  });

  const page = intakes.slice(0, take);
  const nextCursor = intakes.length > take ? (page[page.length - 1]?.id ?? null) : null;

  const seatKeys = page
    .filter((i) => i.firstSessionId)
    .map((i) => ({ sessionId: i.firstSessionId!, studentId: i.student.id }));
  const seats = seatKeys.length
    ? await prisma.enrollment.findMany({
        where: { OR: seatKeys },
        select: {
          sessionId: true,
          studentId: true,
          paid: true,
          waitlisted: true,
          paymentStatus: true,
          danceRole: true,
        },
      })
    : [];
  const seatByKey = new Map(seats.map((s) => [`${s.sessionId}:${s.studentId}`, s]));

  return {
    nextCursor,
    rows: page.map((i) => {
      const seat = i.firstSessionId ? seatByKey.get(`${i.firstSessionId}:${i.student.id}`) : null;
      return {
        id: i.id,
        status: i.status,
        source: i.source,
        createdAt: i.createdAt.toISOString(),
        contactedAt: i.contactedAt?.toISOString() ?? null,
        firstAttendedAt: i.firstAttendedAt?.toISOString() ?? null,
        assignedToId: i.assignedToId,
        student: i.student,
        firstClass: i.firstSession
          ? {
              courseTitle: i.firstSession.course.title,
              style: i.firstSession.course.style,
              level: i.firstSession.course.level,
              dayOfWeek: i.firstSession.dayOfWeek,
              startTime: i.firstSession.startTime.toISOString(),
              seat:
                seat && seat.paymentStatus !== "CANCELLED_INTERAC"
                  ? {
                      paid: seat.paid,
                      waitlisted: seat.waitlisted,
                      pendingInterac: seat.paymentStatus === "PENDING_INTERAC",
                      danceRole: seat.danceRole,
                    }
                  : null,
            }
          : null,
      };
    }),
  };
}

export async function listIntakeStaff(locationId: string): Promise<IntakeStaffOption[]> {
  const members = await prisma.locationMember.findMany({
    where: { locationId, user: { role: { in: [...STAFF_ROLES] } } },
    select: { user: { select: { id: true, fullName: true } } },
    distinct: ["userId"],
  });
  return members
    .map((m) => m.user)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Students whose intake still counts as a first visit at this location. */
export async function loadFirstVisitStudentIds(
  locationId: string,
  studentIds: readonly string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const rows = await prisma.studentIntake.findMany({
    where: {
      locationId,
      studentId: { in: [...new Set(studentIds)] },
      status: { in: ["NEW", "CONTACTED", "ATTENDED"] },
    },
    select: { studentId: true, status: true, firstAttendedAt: true },
  });
  return new Set(
    rows.filter((r) => isFirstVisit(r.status, r.firstAttendedAt, now)).map((r) => r.studentId),
  );
}
