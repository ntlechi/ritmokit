import "server-only";

import { businessNightWindow } from "@/lib/dance/business-night";
import { centsToCad, toCents } from "@/lib/money/cents";
import { prisma } from "@/lib/prisma";

export { businessNightWindow };

/** Variance the desk may close without a note (CAD). */
export const DRAWER_VARIANCE_TOLERANCE_CAD = 5;
export const DRAWER_VARIANCE_TOLERANCE_CENTS = DRAWER_VARIANCE_TOLERANCE_CAD * 100;

export type DrawerSnapshot = {
  /** Civil business date, YYYY-MM-DD. */
  businessDate: string;
  cashCount: number;
  cashCad: number;
  /** Same figure in integer cents — use this for arithmetic. */
  cashCents: number;
  /** Door Interac entries tonight — informational, never in the drawer. */
  interacCount: number;
  interacCad: number;
  interacCents: number;
  closed: {
    closedAt: string;
    startFloatCad: number;
    countedCad: number;
    varianceCad: number;
    depositCad: number;
  } | null;
};

export async function loadDrawerSnapshot(
  locationId: string,
  timeZone: string,
  now = new Date(),
): Promise<DrawerSnapshot> {
  const { start, end, businessDate, businessDateUtc } = businessNightWindow(now, timeZone);
  const sessionAtLocation = {
    OR: [{ season: { locationId } }, { room: { locationId }, seasonId: null }],
  };

  // SUM() runs in Postgres on NUMERIC(10,2) — exact — and comes back as a
  // Decimal we convert to integer cents once. No per-row float accumulation.
  const [cash, interac, closed] = await Promise.all([
    prisma.enrollment.aggregate({
      where: {
        paymentProvider: "CASH",
        paid: true,
        paidAt: { gte: start, lt: end },
        session: sessionAtLocation,
      },
      _sum: { amountCad: true },
      _count: { _all: true },
    }),
    prisma.enrollment.aggregate({
      where: {
        paymentProvider: "INTERAC",
        attended: true,
        paymentPendingAt: { gte: start, lt: end },
        paymentStatus: { not: "CANCELLED_INTERAC" },
        session: sessionAtLocation,
      },
      _sum: { amountCad: true },
      _count: { _all: true },
    }),
    prisma.cashDrawerClose.findUnique({
      where: { locationId_businessDate: { locationId, businessDate: businessDateUtc } },
      select: {
        createdAt: true,
        startFloatCad: true,
        countedCad: true,
        varianceCad: true,
        depositCad: true,
      },
    }),
  ]);

  const cashCents = toCents(cash._sum.amountCad);
  const interacCents = toCents(interac._sum.amountCad);

  return {
    businessDate,
    cashCount: cash._count._all,
    cashCad: centsToCad(cashCents),
    cashCents,
    interacCount: interac._count._all,
    interacCad: centsToCad(interacCents),
    interacCents,
    closed: closed
      ? {
          closedAt: closed.createdAt.toISOString(),
          startFloatCad: centsToCad(toCents(closed.startFloatCad)),
          countedCad: centsToCad(toCents(closed.countedCad)),
          varianceCad: centsToCad(toCents(closed.varianceCad)),
          depositCad: centsToCad(toCents(closed.depositCad)),
        }
      : null,
  };
}

/** Week aggregate for the owner pulse: door cash actually counted + net variance. */
export async function loadDrawerWeek(locationId: string, weekStart: Date) {
  const agg = await prisma.cashDrawerClose.aggregate({
    where: { locationId, businessDate: { gte: weekStart } },
    _sum: { cashDoorCad: true, varianceCad: true, depositCad: true },
    _count: { _all: true },
  });
  return {
    closes: agg._count._all,
    doorCashCad: centsToCad(toCents(agg._sum.cashDoorCad)),
    varianceCad: centsToCad(toCents(agg._sum.varianceCad)),
    depositCad: centsToCad(toCents(agg._sum.depositCad)),
  };
}
