/**
 * Student CRM — one person per dancer/member, built from live enrollments.
 * Works for partner dance and solo/fitness classes (SOLO role).
 */
import "server-only";

import { asPlainNumber } from "@/lib/data/serialize";
import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { ensureProgressionsForLocation, isChurnRisk } from "@/lib/dance/progression";
import { prisma } from "@/lib/prisma";
import type { CourseLevel, ProgressionStatus, Role } from "@/generated/prisma/enums";

export type CrmEnrollmentRow = {
  enrollmentId: string;
  sessionId: string;
  courseTitle: string;
  style: string;
  seasonName: string | null;
  danceRole: "LEAD" | "FOLLOW" | "SOLO";
  paid: boolean;
  waitlisted: boolean;
  attended: boolean;
  amountCad: number | null;
  createdAt: string;
};

export type CrmNote = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type CrmStudentListItem = {
  studentId: string;
  fullName: string;
  email: string;
  phone: string | null;
  enrollmentCount: number;
  paidCount: number;
  unpaidCount: number;
  waitlistedCount: number;
  lifetimeCad: number;
  lastEnrolledAt: string;
  styles: string[];
  readyCount: number;
  churnRisk: boolean;
  journeyPreview: string[];
};

export type CrmJourneyRow = {
  id: string;
  courseTitle: string;
  seasonName: string;
  style: string;
  level: CourseLevel;
  status: ProgressionStatus;
  danceRole: "LEAD" | "FOLLOW" | "SOLO" | null;
  attendedCount: number;
  expectedWeeks: number;
  attendanceRate: number;
  inviteSentAt: string | null;
};

export type CrmStudentProfile = CrmStudentListItem & {
  notes: CrmNote[];
  history: CrmEnrollmentRow[];
  journey: CrmJourneyRow[];
};

function locationEnrollmentWhere(locationId: string) {
  return {
    paymentStatus: { not: "CANCELLED_INTERAC" as const },
    session: {
      OR: [
        { season: { locationId } },
        { room: { locationId }, seasonId: null },
      ],
    },
  };
}

export async function listCrmStudents(
  userId: string,
  role: Role,
): Promise<{ locationId: string; locationName: string; students: CrmStudentListItem[] } | null> {
  if (!canAccessManagerSettings(role) && role !== "FRONT_DESK") return null;
  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const locationId = membership.locationId;
  await ensureProgressionsForLocation(locationId).catch((error) => {
    console.error("[crm] ensure progressions", error);
  });
  const rows = await prisma.enrollment.findMany({
    where: locationEnrollmentWhere(locationId),
    select: {
      paid: true,
      waitlisted: true,
      amountCad: true,
      createdAt: true,
      student: { select: { id: true, fullName: true, email: true, phone: true } },
      session: { select: { course: { select: { style: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byId = new Map<string, CrmStudentListItem>();
  for (const row of rows) {
    const existing = byId.get(row.student.id);
    const amount = asPlainNumber(row.amountCad) ?? 0;
    if (!existing) {
      byId.set(row.student.id, {
        studentId: row.student.id,
        fullName: row.student.fullName,
        email: row.student.email,
        phone: row.student.phone,
        enrollmentCount: 1,
        paidCount: row.paid && !row.waitlisted ? 1 : 0,
        unpaidCount: !row.paid && !row.waitlisted ? 1 : 0,
        waitlistedCount: row.waitlisted ? 1 : 0,
        lifetimeCad: row.paid && !row.waitlisted ? amount : 0,
        lastEnrolledAt: row.createdAt.toISOString(),
        styles: row.session.course.style ? [row.session.course.style] : [],
        readyCount: 0,
        churnRisk: false,
        journeyPreview: [],
      });
      continue;
    }
    existing.enrollmentCount += 1;
    if (row.paid && !row.waitlisted) {
      existing.paidCount += 1;
      existing.lifetimeCad += amount;
    } else if (!row.paid && !row.waitlisted) {
      existing.unpaidCount += 1;
    }
    if (row.waitlisted) existing.waitlistedCount += 1;
    if (row.createdAt.toISOString() > existing.lastEnrolledAt) {
      existing.lastEnrolledAt = row.createdAt.toISOString();
    }
    const style = row.session.course.style;
    if (style && !existing.styles.includes(style)) existing.styles.push(style);
  }

  const progressions = await prisma.studentProgression.findMany({
    where: { locationId },
    select: {
      studentId: true,
      danceStyle: true,
      currentLevel: true,
      status: true,
      attendanceRate: true,
      expectedWeeks: true,
    },
  });
  for (const p of progressions) {
    const student = byId.get(p.studentId);
    if (!student) continue;
    if (p.status === "READY_TO_ADVANCE") student.readyCount += 1;
    if (isChurnRisk(p)) student.churnRisk = true;
    student.journeyPreview.push(`${p.danceStyle} ${p.currentLevel}`);
  }

  const students = [...byId.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "fr"),
  );

  return {
    locationId,
    locationName: membership.location.name,
    students,
  };
}

export async function getCrmStudentProfile(
  userId: string,
  role: Role,
  studentId: string,
): Promise<{ locationId: string; locationName: string; profile: CrmStudentProfile } | null> {
  const list = await listCrmStudents(userId, role);
  if (!list) return null;
  const summary = list.students.find((s) => s.studentId === studentId);
  if (!summary) return null;

  const [enrollments, notes, journey] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId, ...locationEnrollmentWhere(list.locationId) },
      select: {
        id: true,
        sessionId: true,
        paid: true,
        waitlisted: true,
        attended: true,
        amountCad: true,
        createdAt: true,
        danceRole: true,
        session: {
          select: {
            course: { select: { title: true, style: true } },
            season: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.studentNote.findMany({
      where: { studentId, locationId: list.locationId },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.studentProgression.findMany({
      where: { studentId, locationId: list.locationId },
      select: {
        id: true,
        danceStyle: true,
        currentLevel: true,
        status: true,
        danceRole: true,
        attendedCount: true,
        expectedWeeks: true,
        attendanceRate: true,
        inviteSentAt: true,
        course: { select: { title: true } },
        season: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    locationId: list.locationId,
    locationName: list.locationName,
    profile: {
      ...summary,
      history: enrollments.map((e) => ({
        enrollmentId: e.id,
        sessionId: e.sessionId,
        courseTitle: e.session.course.title,
        style: e.session.course.style,
        seasonName: e.session.season?.name ?? null,
        danceRole: e.danceRole,
        paid: e.paid,
        waitlisted: e.waitlisted,
        attended: e.attended,
        amountCad: asPlainNumber(e.amountCad),
        createdAt: e.createdAt.toISOString(),
      })),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        authorName: n.author.fullName,
        createdAt: n.createdAt.toISOString(),
      })),
      journey: journey.map((j) => ({
        id: j.id,
        courseTitle: j.course.title,
        seasonName: j.season.name,
        style: j.danceStyle,
        level: j.currentLevel,
        status: j.status,
        danceRole: j.danceRole,
        attendedCount: j.attendedCount,
        expectedWeeks: j.expectedWeeks,
        attendanceRate: j.attendanceRate,
        inviteSentAt: j.inviteSentAt?.toISOString() ?? null,
      })),
    },
  };
}
