import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RentalPaymentStatus } from "@/generated/prisma/enums";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";
import { sendRentalEmail } from "@/lib/notifications/rental-email";
import { DEFAULT_RENTAL_SETTINGS, type RentalSettingsView } from "@/lib/rentals/defaults";
import type {
  BookingOccupancyInput,
  ClassOccupancyInput,
  RentalForClassCheck,
} from "@/lib/rentals/schedule";
import { civilDateFromDbDate, hhmmFromUtcDate } from "@/lib/rentals/wall-time";
import { stationLabel } from "@/lib/stations/display";
import { civilDateToUtcDate } from "@/lib/time/location-timezone";

type Db = Prisma.TransactionClient | typeof prisma;

export async function loadRentalSettings(locationId: string): Promise<RentalSettingsView> {
  const row = await prisma.locationRentalSettings.findUnique({ where: { locationId } });
  if (!row) {
    return { ...DEFAULT_RENTAL_SETTINGS, durationOptions: [...DEFAULT_RENTAL_SETTINGS.durationOptions] };
  }
  return {
    openHour: row.openHour,
    closeHour: row.closeHour,
    bufferMinutes: row.bufferMinutes,
    minLeadHours: row.minLeadHours,
    b2bRequiresApproval: row.b2bRequiresApproval,
    durationOptions: row.durationOptions.length
      ? row.durationOptions
      : [...DEFAULT_RENTAL_SETTINGS.durationOptions],
    moduleEnabled: row.moduleEnabled,
  };
}

/**
 * Every class that can occupy a room: draft and active seasons (a draft season
 * is next term's grid — renting its rooms out would collide once it opens),
 * weekly classes clipped to their season dates, one-offs on their own date.
 */
export async function loadClassOccupancy(locationId: string): Promise<ClassOccupancyInput[]> {
  const rows = await prisma.classSession.findMany({
    where: {
      OR: [
        { season: { locationId, status: { in: ["DRAFT", "ACTIVE"] } } },
        { seasonId: null, room: { locationId } },
      ],
    },
    select: {
      roomId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      course: { select: { title: true } },
      season: { select: { startsOn: true, endsOn: true } },
    },
  });

  return rows.map((r) => ({
    roomId: r.roomId,
    dayOfWeek: r.dayOfWeek,
    timeStart: hhmmFromUtcDate(r.startTime),
    timeEnd: hhmmFromUtcDate(r.endTime),
    label: r.course.title,
    dateIso: r.dayOfWeek == null ? civilDateFromDbDate(r.startTime) : null,
    validFrom: r.season ? civilDateFromDbDate(r.season.startsOn) : null,
    validTo: r.season ? civilDateFromDbDate(r.season.endsOn) : null,
  }));
}

export const UNPAID_HOLD_STATUSES: RentalPaymentStatus[] = ["PENDING_INTERAC", "PENDING_PAYPAL"];

/**
 * Bookings that still occupy their room at `now`: not cancelled/expired, and not
 * an unpaid hold past its `expiresAt` (those are free even before they're flagged).
 */
export function occupyingBookingWhere(now = new Date()): Prisma.RentalBookingWhereInput {
  return {
    status: { notIn: ["CANCELLED", "EXPIRED"] },
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: now } },
      { paymentStatus: { notIn: UNPAID_HOLD_STATUSES } },
    ],
  };
}

export async function loadBookingOccupancy(
  db: Db,
  roomId: string,
  fromDate: string,
  toDate: string,
  options: { excludeId?: string } = {},
): Promise<BookingOccupancyInput[]> {
  const rows = await db.rentalBooking.findMany({
    where: {
      roomId,
      date: { gte: civilDateToUtcDate(fromDate), lte: civilDateToUtcDate(toDate) },
      ...occupyingBookingWhere(),
      ...(options.excludeId ? { id: { not: options.excludeId } } : {}),
    },
    select: { roomId: true, date: true, timeStart: true, timeEnd: true, type: true, status: true },
  });

  return rows.map((r) => ({
    roomId: r.roomId,
    date: civilDateFromDbDate(r.date),
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    type: r.type.toLowerCase() as "prive" | "b2b" | "staff",
    status: r.status.toLowerCase(),
  }));
}

/** Rentals a class in `roomId` could collide with, from `fromDate` on (for the class conflict check). */
export async function loadRoomRentalsForClassCheck(
  roomId: string,
  fromDate: string,
  toDate: string | null,
): Promise<RentalForClassCheck[]> {
  const rows = await prisma.rentalBooking.findMany({
    where: {
      roomId,
      date: {
        gte: civilDateToUtcDate(fromDate),
        ...(toDate ? { lte: civilDateToUtcDate(toDate) } : {}),
      },
      ...occupyingBookingWhere(),
    },
    orderBy: [{ date: "asc" }, { timeStart: "asc" }],
    select: { date: true, timeStart: true, timeEnd: true, clientName: true, clientOrg: true },
  });
  return rows.map((r) => ({
    date: civilDateFromDbDate(r.date),
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    clientName: r.clientOrg?.trim() || r.clientName,
  }));
}

/**
 * Flag unpaid online holds past `expiresAt` as EXPIRED and tell the client and
 * the studio. Lazy by design: called from the rental entry points, so no cron
 * is needed for the slot to become bookable again.
 */
export async function releaseExpiredRentalHolds(
  scope: { locationId?: string; roomId?: string } = {},
): Promise<number> {
  await ensureStudioOsSchema();
  const now = new Date();
  const released = await prisma.rentalBooking.updateManyAndReturn({
    where: {
      ...(scope.locationId ? { locationId: scope.locationId } : {}),
      ...(scope.roomId ? { roomId: scope.roomId } : {}),
      status: { in: ["CONFIRMED", "PENDING"] },
      paymentStatus: { in: UNPAID_HOLD_STATUSES },
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      paymentStatus: "CANCELLED",
      cancelledAt: now,
      cancellationReason: "Paiement non reçu à temps — créneau libéré automatiquement.",
    },
    include: { room: true },
  });

  for (const booking of released) {
    const room = stationLabel(booking.room, "fr");
    const when = `${civilDateFromDbDate(booking.date)} ${booking.timeStart}–${booking.timeEnd}`;
    void sendRentalEmail({
      to: booking.clientEmail,
      kind: "rental_expired",
      subject: `Réservation expirée — ${room}`,
      text: [
        `Nous n'avons pas reçu votre paiement à temps : votre réservation a été libérée.`,
        `Salle: ${room}`,
        `Date: ${when}`,
        `Si vous avez déjà envoyé le paiement, contactez le studio — nous réserverons à nouveau si le créneau est libre.`,
      ].join("\n"),
      meta: { bookingId: booking.id },
    });
    void rentalStaffRecipient(booking.locationId)
      .then((to) =>
        sendRentalEmail({
          to,
          kind: "rental_expired_staff",
          subject: `Location expirée (non payée) — ${room} ${when}`,
          text: [
            `Le paiement n'est pas arrivé à temps; le créneau est de nouveau disponible.`,
            `Client: ${booking.clientName} <${booking.clientEmail}>`,
            `Salle: ${room}`,
            `Date: ${when}`,
            `Montant: ${(booking.priceCents / 100).toFixed(2)} ${booking.currency}`,
          ].join("\n"),
          meta: { bookingId: booking.id },
        }),
      )
      .catch((error) => console.error("[rentals] expiry staff alert failed", error));
  }

  return released.length;
}

/**
 * Serialises bookings for one room: the website, the desk and an approval can
 * race for the same slot, and the check-then-insert is only safe under this lock.
 */
export async function lockRoomForBooking(tx: Prisma.TransactionClient, roomId: string) {
  await tx.$queryRaw`SELECT id FROM stations WHERE id = ${roomId}::uuid FOR UPDATE`;
}

/** Where "new booking" alerts go: RENTAL_NOTIFY_EMAIL, else the studio's first owner/manager. */
export async function rentalStaffRecipient(locationId: string): Promise<string> {
  const configured = process.env.RENTAL_NOTIFY_EMAIL?.trim();
  if (configured) return configured;
  const member = await prisma.locationMember.findFirst({
    where: { locationId, user: { role: { in: ["OWNER", "MANAGER"] } } },
    select: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return member?.user.email ?? "";
}
