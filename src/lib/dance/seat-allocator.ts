/**
 * Seat allocator — the single write path for putting a dancer in a class.
 *
 * Concurrency model
 * -----------------
 * Every seat mutation for a class runs inside one transaction that first takes
 * a row lock on that `class_sessions` row (`SELECT … FOR UPDATE`). Twenty
 * Follows racing for the last two seats therefore serialize on one 16-byte
 * row: the first two see free seats, the other eighteen see a full pool and
 * are waitlisted / refused. No table lock, no SERIALIZABLE retry storms, and
 * classes never contend with each other. Multi-class writes (packages) lock
 * their sessions in sorted id order so two packages can never deadlock.
 *
 * Idempotency
 * -----------
 * `(session_id, student_id)` is unique. A retried checkout click or a flaky
 * LTE resend finds the existing row and returns it as `existing` instead of
 * failing with P2002 — the caller decides whether that is a 200 or a 409.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { DanceRole, PaymentStatus, PricingTier } from "@/generated/prisma/enums";
import {
  evaluateCoupleEnrollment,
  evaluateParityEnrollment,
  maxImbalanceForCourse,
  type ParityDecision,
  type RoleCapacity,
} from "@/lib/dance/parity";
import { ticketCodeForEnrollment } from "@/lib/payments/interac-status";

export type Tx = Prisma.TransactionClient;

/** Interactive-transaction budget for a seat allocation (lock wait + writes). */
export const SEAT_TX_OPTIONS = { maxWait: 4_000, timeout: 8_000 } as const;

export type LockedSession = {
  id: string;
  seasonId: string | null;
  seasonStatus: string | null;
  bookingOpen: boolean | null;
  locationId: string;
  organizationId: string;
  timezone: string;
  courseId: string;
  courseTitle: string;
  courseStyle: string;
  maxLeads: number;
  maxFollows: number;
  priceRegular: number;
  priceCouple: number | null;
  priceStudent: number | null;
};

type LockedRow = {
  id: string;
  season_id: string | null;
  season_status: string | null;
  booking_open: boolean | null;
  location_id: string;
  organization_id: string;
  timezone: string;
  course_id: string;
  course_title: string;
  course_style: string;
  max_leads: number;
  max_follows: number;
  price_regular: Prisma.Decimal | string | number;
  price_couple: Prisma.Decimal | string | number | null;
  price_student: Prisma.Decimal | string | number | null;
};

function num(value: Prisma.Decimal | string | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Lock one or more classes for the rest of the transaction. Returns a map so
 * callers can keep working with ids; missing ids are simply absent.
 */
export async function lockSessions(
  tx: Tx,
  sessionIds: readonly string[],
): Promise<Map<string, LockedSession>> {
  const ordered = [...new Set(sessionIds)].sort();
  if (ordered.length === 0) return new Map();

  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT cs.id,
           cs.season_id,
           ss.status::text            AS season_status,
           ss.booking_open,
           COALESCE(ss.location_id, st.location_id) AS location_id,
           l.organization_id,
           l.timezone,
           cs.course_id,
           c.title                    AS course_title,
           c.style                    AS course_style,
           cs.max_leads,
           cs.max_follows,
           cs.price_regular,
           cs.price_couple,
           cs.price_student
    FROM class_sessions cs
    JOIN courses  c  ON c.id  = cs.course_id
    JOIN stations st ON st.id = cs.room_id
    LEFT JOIN session_seasons ss ON ss.id = cs.season_id
    JOIN locations l ON l.id = COALESCE(ss.location_id, st.location_id)
    WHERE cs.id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY cs.id
    FOR UPDATE OF cs
  `;

  const out = new Map<string, LockedSession>();
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      seasonId: r.season_id,
      seasonStatus: r.season_status,
      bookingOpen: r.booking_open,
      locationId: r.location_id,
      organizationId: r.organization_id,
      timezone: r.timezone || "America/Toronto",
      courseId: r.course_id,
      courseTitle: r.course_title,
      courseStyle: r.course_style,
      maxLeads: r.max_leads,
      maxFollows: r.max_follows,
      priceRegular: num(r.price_regular),
      priceCouple: r.price_couple == null ? null : num(r.price_couple),
      priceStudent: r.price_student == null ? null : num(r.price_student),
    });
  }
  return out;
}

export async function lockSession(tx: Tx, sessionId: string): Promise<LockedSession | null> {
  const map = await lockSessions(tx, [sessionId]);
  return map.get(sessionId) ?? null;
}

/**
 * Seated head-count by role, read *after* the lock so it reflects every
 * committed seat. One indexed aggregate on (session_id, dance_role, waitlisted).
 */
export async function loadLockedCapacity(tx: Tx, session: LockedSession): Promise<RoleCapacity> {
  const groups = await tx.enrollment.groupBy({
    by: ["danceRole"],
    where: {
      sessionId: session.id,
      waitlisted: false,
      paymentStatus: { not: "CANCELLED_INTERAC" },
    },
    _count: { _all: true },
  });
  let filledLeads = 0;
  let filledFollows = 0;
  let filledSolos = 0;
  for (const g of groups) {
    if (g.danceRole === "LEAD") filledLeads = g._count._all;
    else if (g.danceRole === "FOLLOW") filledFollows = g._count._all;
    else filledSolos = g._count._all;
  }
  return {
    maxLeads: session.maxLeads,
    maxFollows: session.maxFollows,
    filledLeads,
    filledFollows,
    filledSolos,
    maxImbalance: maxImbalanceForCourse({ style: session.courseStyle, title: session.courseTitle }),
  };
}

export type SeatPayment = {
  paid: boolean;
  paymentStatus: "NONE" | "PENDING" | "PENDING_INTERAC" | "PAID";
  paymentProvider: "CASH" | "INTERAC" | "PAYPAL" | "STRIPE" | null;
  paidAt: Date | null;
  paymentPendingAt: Date | null;
};

export const UNPAID: SeatPayment = {
  paid: false,
  paymentStatus: "NONE",
  paymentProvider: null,
  paidAt: null,
  paymentPendingAt: null,
};

export type SeatRequest = {
  studentId: string;
  danceRole: DanceRole;
  allowWaitlist: boolean;
  pricingTier: PricingTier;
  amountCad: number;
  interacReferenceHint: string;
  payment?: SeatPayment;
  /** Internal linkage only (`couple:<id>`, `pkg:<id>`). Never client-supplied. */
  paymentRef?: string | null;
  attended?: boolean;
  /**
   * Skip the parity engine — the caller already evaluated this seat as part
   * of a pair (`evaluateCoupleEnrollment`). Still bounded by the row lock.
   */
  presized?: boolean;
};

export type ExistingSeat = {
  id: string;
  ticketCode: string | null;
  waitlisted: boolean;
  paid: boolean;
  paymentStatus: PaymentStatus;
  danceRole: DanceRole;
  createdAt: Date;
};

export type SeatOutcome =
  | { kind: "seated"; enrollmentId: string; ticketCode: string; waitlisted: false }
  | {
      kind: "waitlisted";
      enrollmentId: string;
      ticketCode: string;
      waitlisted: true;
      reason: "role_full" | "imbalance";
    }
  | { kind: "existing"; enrollmentId: string; ticketCode: string | null; existing: ExistingSeat }
  | { kind: "refused"; reason: Extract<ParityDecision, { ok: false }>["reason"] };

const existingSelect = {
  id: true,
  ticketCode: true,
  waitlisted: true,
  paid: true,
  paymentStatus: true,
  danceRole: true,
  createdAt: true,
} as const;

async function findExisting(tx: Tx, sessionId: string, studentId: string) {
  return tx.enrollment.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
    select: existingSelect,
  });
}

/**
 * Allocate one seat under the session lock. Capacity is re-read inside the
 * lock so the parity decision is made against committed truth, not a stale
 * public availability payload.
 */
export async function allocateSeat(
  tx: Tx,
  session: LockedSession,
  req: SeatRequest,
  capacity?: RoleCapacity,
): Promise<SeatOutcome> {
  const existing = await findExisting(tx, session.id, req.studentId);
  if (existing) {
    return { kind: "existing", enrollmentId: existing.id, ticketCode: existing.ticketCode, existing };
  }

  const cap = capacity ?? (await loadLockedCapacity(tx, session));
  const decision: ParityDecision = req.presized
    ? { ok: true, waitlisted: false }
    : evaluateParityEnrollment(cap, req.danceRole, { allowWaitlist: req.allowWaitlist });
  if (!decision.ok) return { kind: "refused", reason: decision.reason };

  const id = randomUUID();
  const ticketCode = ticketCodeForEnrollment(id);
  const payment = req.payment ?? UNPAID;
  const now = new Date();

  try {
    await tx.enrollment.create({
      data: {
        id,
        sessionId: session.id,
        studentId: req.studentId,
        danceRole: req.danceRole,
        waitlisted: decision.waitlisted,
        waitlistedAt: decision.waitlisted ? now : null,
        pricingTier: req.pricingTier,
        amountCad: req.amountCad,
        currency: "CAD",
        paymentRef: req.paymentRef ?? null,
        ticketCode,
        interacReferenceHint: req.interacReferenceHint,
        attended: req.attended ?? false,
        ...payment,
      },
    });
  } catch (error) {
    // Only reachable if a legacy writer bypassed the lock; treat as a retry.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await findExisting(tx, session.id, req.studentId);
      if (raced) {
        return { kind: "existing", enrollmentId: raced.id, ticketCode: raced.ticketCode, existing: raced };
      }
    }
    throw error;
  }

  // Keep the in-memory picture current for follow-up allocations in the same tx.
  if (!decision.waitlisted) bump(cap, req.danceRole);

  return decision.waitlisted
    ? { kind: "waitlisted", enrollmentId: id, ticketCode, waitlisted: true, reason: decision.reason }
    : { kind: "seated", enrollmentId: id, ticketCode, waitlisted: false };
}

function bump(cap: RoleCapacity, role: DanceRole) {
  if (role === "LEAD") cap.filledLeads += 1;
  else if (role === "FOLLOW") cap.filledFollows += 1;
  else cap.filledSolos = (cap.filledSolos ?? 0) + 1;
}

export type PlacedSeat = Exclude<SeatOutcome, { kind: "refused" }>;

export type CoupleOutcome =
  | { kind: "seated"; primary: PlacedSeat; partner: PlacedSeat }
  | { kind: "refused"; reason: "role_full" | "invalid_couple_role" }
  | { kind: "existing"; primary: PlacedSeat };

/**
 * Seat a Lead + Follow pair atomically. Both seats are checked against the
 * same locked capacity, so a couple can never split across seated/waitlisted.
 */
export async function allocateCouple(
  tx: Tx,
  session: LockedSession,
  primary: Omit<SeatRequest, "presized">,
  partner: Omit<SeatRequest, "presized" | "danceRole">,
): Promise<CoupleOutcome> {
  if (primary.danceRole === "SOLO") return { kind: "refused", reason: "invalid_couple_role" };

  const existing = await findExisting(tx, session.id, primary.studentId);
  if (existing) {
    return {
      kind: "existing",
      primary: { kind: "existing", enrollmentId: existing.id, ticketCode: existing.ticketCode, existing },
    };
  }

  const cap = await loadLockedCapacity(tx, session);
  const decision = evaluateCoupleEnrollment(cap);
  if (!decision.ok) return { kind: "refused", reason: "role_full" };

  const first = await allocateSeat(tx, session, { ...primary, presized: true }, cap);
  if (first.kind === "refused") return { kind: "refused", reason: "role_full" };

  const partnerRole: DanceRole = primary.danceRole === "LEAD" ? "FOLLOW" : "LEAD";
  const second = await allocateSeat(
    tx,
    session,
    {
      ...partner,
      danceRole: partnerRole,
      presized: true,
      paymentRef: `couple:${first.enrollmentId}`,
    },
    cap,
  );
  // Parity was pre-checked for the pair under lock; a refusal here would be a bug, not a race.
  if (second.kind === "refused") return { kind: "refused", reason: "role_full" };
  return { kind: "seated", primary: first, partner: second };
}

/**
 * Promote an already-waitlisted row to a seat under the lock. Returns false
 * when parity still forbids it — the caller must not flip `waitlisted`.
 */
export async function seatWaitlisted(
  tx: Tx,
  session: LockedSession,
  enrollment: { id: string; danceRole: DanceRole },
): Promise<boolean> {
  const cap = await loadLockedCapacity(tx, session);
  const decision = evaluateParityEnrollment(cap, enrollment.danceRole, { allowWaitlist: false });
  if (!decision.ok) return false;
  const res = await tx.enrollment.updateMany({
    where: { id: enrollment.id, waitlisted: true },
    data: { waitlisted: false, waitlistedAt: null, promotedAt: new Date() },
  });
  return res.count === 1;
}

/** Tenant scope: is this class operated by one of `locationIds`? */
export function sessionInLocations(session: LockedSession, locationIds: readonly string[]): boolean {
  return locationIds.includes(session.locationId);
}
