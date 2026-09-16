/**
 * Studio enrollment roster — source of truth for Accueil / tenant Inscrits.
 */
import "server-only";

import { asPlainNumber } from "@/lib/data/serialize";
import { publicPaymentStatus } from "@/lib/payments/interac-status";
import { prisma } from "@/lib/prisma";
import { resolvePublicLocation } from "@/lib/public-api/tenant";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canAccessLocation } from "@/lib/locations/active-location";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

const DAY_NAMES_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

export type StudioEnrollmentListItem = {
  enrollmentId: string;
  sessionId: string;
  seasonId: string | null;
  seasonName: string | null;
  courseTitle: string;
  dayOfWeek: number | null;
  dayLabel: string | null;
  timeStart: string;
  timeEnd: string;
  instructorName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string | null;
  danceRole: "LEAD" | "FOLLOW" | "SOLO";
  paid: boolean;
  paymentStatus: string;
  paymentProvider: string | null;
  pricingTier: string;
  amountCad: number | null;
  waitlisted: boolean;
  attended: boolean | null;
  ticketCode: string | null;
  packageClassIds: string[] | null;
  createdAt: string;
};

function hhmmFromIso(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export async function resolveStudioLocationId(input: {
  userId?: string | null;
  role?: Role | null;
  locationId?: string | null;
  locationSlug?: string | null;
  organizationSlug?: string | null;
  /** When true, slug/id from query is required (Bearer / machine auth). */
  requireExplicitLocation?: boolean;
  /**
   * Organisation the machine token is bound to. The resolved location must
   * belong to it; `null` (dev-only unscoped secret) skips the check.
   */
  tokenOrganizationSlug?: string | null;
}): Promise<{ ok: true; locationId: string } | { ok: false; error: string; status: number }> {
  if (input.locationId || input.locationSlug) {
    const loc = await resolvePublicLocation({
      locationId: input.locationId,
      locationSlug: input.locationSlug,
      organizationSlug: input.organizationSlug ?? input.tokenOrganizationSlug,
    });
    if (!loc) return { ok: false, error: "location_not_found", status: 404 };

    if (input.tokenOrganizationSlug && loc.organizationSlug !== input.tokenOrganizationSlug) {
      // Same status as "not found": a token must not learn which ids exist elsewhere.
      return { ok: false, error: "location_not_found", status: 404 };
    }

    // Session callers: brand-scoped (owners see their org's sites, never another tenant).
    if (input.userId && input.role) {
      if (!(await canAccessLocation(input.userId, input.role, loc.id))) {
        return { ok: false, error: "forbidden", status: 403 };
      }
    }

    return { ok: true, locationId: loc.id };
  }

  if (input.requireExplicitLocation) {
    return { ok: false, error: "location_required", status: 400 };
  }

  if (!input.userId) return { ok: false, error: "unauthorized", status: 401 };
  const membership = await getPrimaryMembership(input.userId);
  if (!membership) return { ok: false, error: "no_location", status: 403 };
  return { ok: true, locationId: membership.locationId };
}

export async function listStudioEnrollments(input: {
  locationId: string;
  seasonId?: string | null;
  sessionId?: string | null;
  paid?: boolean | null;
  waitlisted?: boolean | null;
  q?: string | null;
  limit?: number;
}): Promise<{
  locationId: string;
  items: StudioEnrollmentListItem[];
  count: number;
}> {
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);
  const q = input.q?.trim() || null;

  // Location scope is unconditional — `seasonId` / `sessionId` only narrow it.
  // A guessed seasonId from another tenant therefore matches nothing.
  const sessionScope: Prisma.ClassSessionWhereInput = {
    OR: [
      { season: { locationId: input.locationId } },
      { seasonId: null, room: { locationId: input.locationId } },
    ],
    ...(input.seasonId ? { seasonId: input.seasonId } : {}),
  };

  const search: Prisma.EnrollmentWhereInput = q
    ? {
        OR: [
          { student: { fullName: { contains: q, mode: "insensitive" } } },
          { student: { email: { contains: q, mode: "insensitive" } } },
          { student: { phone: { contains: q, mode: "insensitive" } } },
          { ticketCode: { contains: q, mode: "insensitive" } },
          { session: { course: { title: { contains: q, mode: "insensitive" } } } },
        ],
      }
    : {};

  const rows = await prisma.enrollment.findMany({
    where: {
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.paid === true ? { paid: true } : {}),
      ...(input.paid === false ? { paid: false } : {}),
      ...(input.waitlisted === true ? { waitlisted: true } : {}),
      ...(input.waitlisted === false ? { waitlisted: false } : {}),
      session: sessionScope,
      paymentStatus: { not: "CANCELLED_INTERAC" },
      ...search,
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      danceRole: true,
      paid: true,
      paymentStatus: true,
      paymentProvider: true,
      pricingTier: true,
      amountCad: true,
      waitlisted: true,
      attended: true,
      ticketCode: true,
      createdAt: true,
      student: { select: { id: true, fullName: true, email: true, phone: true } },
      session: {
        select: {
          id: true,
          seasonId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          course: { select: { title: true } },
          instructor: { select: { fullName: true } },
          season: { select: { id: true, name: true } },
        },
      },
    },
  });

  const items: StudioEnrollmentListItem[] = rows.map((row) => {
    const dayOfWeek = row.session.dayOfWeek;
    return {
      enrollmentId: row.id,
      sessionId: row.session.id,
      seasonId: row.session.seasonId,
      seasonName: row.session.season?.name ?? null,
      courseTitle: row.session.course.title,
      dayOfWeek,
      dayLabel: dayOfWeek != null ? (DAY_NAMES_FR[dayOfWeek] ?? null) : null,
      timeStart: hhmmFromIso(row.session.startTime),
      timeEnd: hhmmFromIso(row.session.endTime),
      instructorName: row.session.instructor.fullName,
      studentId: row.student.id,
      studentName: row.student.fullName,
      studentEmail: row.student.email,
      studentPhone: row.student.phone,
      danceRole: row.danceRole,
      paid: row.paid,
      paymentStatus: publicPaymentStatus(row.paymentStatus, row.paymentProvider),
      paymentProvider: row.paymentProvider?.toLowerCase() ?? null,
      pricingTier: row.pricingTier,
      amountCad: row.amountCad != null ? asPlainNumber(row.amountCad) : null,
      waitlisted: row.waitlisted,
      attended: row.attended ? true : null,
      ticketCode: row.ticketCode,
      packageClassIds: null,
      createdAt: row.createdAt.toISOString(),
    };
  });

  return { locationId: input.locationId, items, count: items.length };
}

export async function updateStudioEnrollmentAttendance(input: {
  locationId: string;
  enrollmentId: string;
  attended: boolean | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const row = await prisma.enrollment.findFirst({
    where: {
      id: input.enrollmentId,
      session: {
        OR: [
          { season: { locationId: input.locationId } },
          { seasonId: null, room: { locationId: input.locationId } },
        ],
      },
    },
    select: { id: true, waitlisted: true },
  });
  if (!row) return { ok: false, error: "not_found", status: 404 };
  if (row.waitlisted) return { ok: false, error: "waitlisted", status: 409 };

  // Conditional write: a second identical PATCH (proxy retry) touches 0 rows.
  await prisma.enrollment.updateMany({
    where: { id: row.id, waitlisted: false },
    data: { attended: input.attended === true },
  });
  return { ok: true };
}
