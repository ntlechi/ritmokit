import "server-only";

import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import type { CodeRedOffer } from "@/lib/actions/code-red";

/** Offres Code Rouge PENDING pour l'employé connecté (carte flash mobile). */
export async function getPendingCodeRedOffersForUser(userId: string): Promise<CodeRedOffer[]> {
  const bids = await prisma.emergencyBid.findMany({
    where: {
      userId,
      status: "PENDING",
      shift: {
        urgency: "CODE_RED",
        employeeId: null,
        startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    },
    include: {
      shift: {
        include: { station: true },
      },
    },
    orderBy: { shift: { startsAt: "asc" } },
  });

  return bids.map((bid) => ({
    bidId: bid.id,
    shiftId: bid.shiftId,
    stationId: bid.shift.stationId,
    stationNameFr: bid.shift.station.nameFr,
    stationNameEn: bid.shift.station.nameEn,
    stationNameEs: bid.shift.station.nameEs,
    stationColorHex: bid.shift.station.colorHex,
    startsAt: bid.shift.startsAt.toISOString(),
    endsAt: bid.shift.endsAt.toISOString(),
    surgeBonus: bid.shift.surgeBonus != null ? asPlainNumber(bid.shift.surgeBonus) : null,
    codeRedAt: bid.shift.codeRedAt?.toISOString() ?? null,
  }));
}
