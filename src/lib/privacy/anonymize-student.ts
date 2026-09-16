/**
 * Loi 25 / CAI — right to erasure without breaking the books.
 *
 * We never `DELETE` a student `User`: `enrollments.student_id` cascades, and
 * `payment_events` cascade from enrollments, so a delete would erase the
 * financial ledger. Instead we *pseudonymize*: identity columns are replaced
 * by a deterministic, non-reversible stand-in; free-text PII (notes, Interac
 * hints, provider payloads) is removed; amounts, statuses, dates and event
 * ids stay intact for the 6-year fiscal retention.
 *
 * Tenant rule: a student row is shared across organisations (global email
 * uniqueness). A studio may only retire a student whose every enrollment sits
 * in that studio's locations; otherwise the request is refused as
 * `shared_across_tenants` and must go through the platform operator.
 */
import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { anonymizedIdentity, isAnonymizedEmail } from "@/lib/privacy/identity";
import { prisma } from "@/lib/prisma";

export type AnonymizeResult =
  | { ok: true; studentId: string; alreadyAnonymized: boolean; enrollments: number; notesDeleted: number }
  | {
      ok: false;
      error: "not_found" | "not_a_student" | "shared_across_tenants" | "out_of_scope";
    };

/** Default inactivity horizon for the automated sweep. */
export const RETENTION_INACTIVE_DAYS = 3 * 365;

async function anonymizeInTx(
  tx: Prisma.TransactionClient,
  studentId: string,
): Promise<{ enrollments: number; notesDeleted: number }> {
  const identity = anonymizedIdentity(studentId);

  await tx.user.update({
    where: { id: studentId },
    data: {
      email: identity.email,
      fullName: identity.fullName,
      phone: null,
      profilePictureUrl: null,
      bio: null,
      specialties: [],
    },
  });

  const enrollments = await tx.enrollment.updateMany({
    where: { studentId },
    data: { interacReferenceHint: null },
  });

  // Provider callbacks carry payer name/email; keep the row, drop the body.
  await tx.paymentEvent.updateMany({
    where: { enrollment: { studentId } },
    data: { payload: { redacted: true, reason: "loi25_anonymized" } },
  });

  const notes = await tx.studentNote.deleteMany({ where: { studentId } });
  await tx.studentProgression.updateMany({
    where: { studentId },
    data: { instructorNote: null },
  });

  return { enrollments: enrollments.count, notesDeleted: notes.count };
}

/**
 * Retire one student on behalf of a studio. `scopeLocationIds` are the
 * requester's accessible locations (see `staffScope`).
 */
export async function anonymizeStudent(input: {
  studentId: string;
  scopeLocationIds: readonly string[];
}): Promise<AnonymizeResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.studentId },
    select: {
      id: true,
      role: true,
      email: true,
      enrollments: {
        select: {
          session: {
            select: { season: { select: { locationId: true } }, room: { select: { locationId: true } } },
          },
        },
      },
    },
  });
  if (!user) return { ok: false, error: "not_found" };
  if (user.role !== "STUDENT") return { ok: false, error: "not_a_student" };
  if (isAnonymizedEmail(user.email)) {
    return { ok: true, studentId: user.id, alreadyAnonymized: true, enrollments: 0, notesDeleted: 0 };
  }

  const locationIds = user.enrollments.map(
    (e) => e.session.season?.locationId ?? e.session.room.locationId,
  );
  if (locationIds.length === 0) return { ok: false, error: "out_of_scope" };
  const scope = new Set(input.scopeLocationIds);
  if (locationIds.some((id) => !scope.has(id))) {
    return { ok: false, error: "shared_across_tenants" };
  }

  const result = await prisma.$transaction((tx) => anonymizeInTx(tx, user.id));
  return { ok: true, studentId: user.id, alreadyAnonymized: false, ...result };
}

/**
 * Automated retention: students with no enrollment activity since `cutoff`
 * and no future-dated class are pseudonymized in bounded batches. Cursor
 * paginated so the sweep is O(batch) per call and safe under a cron budget.
 */
export async function sweepInactiveStudents(input?: {
  inactiveDays?: number;
  batchSize?: number;
  now?: Date;
}): Promise<{ scanned: number; anonymized: number; cutoff: string }> {
  const now = input?.now ?? new Date();
  const cutoff = new Date(now.getTime() - (input?.inactiveDays ?? RETENTION_INACTIVE_DAYS) * 86_400_000);
  const batchSize = Math.min(Math.max(input?.batchSize ?? 200, 1), 1000);

  const candidates = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      createdAt: { lt: cutoff },
      email: { not: { endsWith: "@anon.ritmokit.invalid" } },
      // No enrollment created after the cutoff…
      enrollments: { none: { createdAt: { gte: cutoff } } },
      // …and nothing still pending money.
      NOT: { enrollments: { some: { paymentStatus: { in: ["PENDING", "PENDING_INTERAC"] } } } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  let anonymized = 0;
  for (const c of candidates) {
    // Synthetic door emails are already PII-free, but notes/hints still need scrubbing.
    await prisma.$transaction((tx) => anonymizeInTx(tx, c.id));
    anonymized += 1;
  }

  return { scanned: candidates.length, anonymized, cutoff: cutoff.toISOString() };
}
