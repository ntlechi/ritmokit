import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canAccessManagerSettings } from "@/lib/auth/session-client";
import { DEFAULT_RENTAL_SETTINGS } from "@/lib/rentals/defaults";
import {
  loadBookingOccupancy,
  loadClassOccupancy,
  lockRoomForBooking,
  occupyingBookingWhere,
  releaseExpiredRentalHolds,
} from "@/lib/rentals/occupancy";
import {
  buildRoomDayTimeline,
  estimateRentalPriceCents,
  isSlotAvailable,
  parseMinutes,
  todayIsoInTimeZone,
  validateRentalWindow,
} from "@/lib/rentals/schedule";
import { civilDateFromDbDate } from "@/lib/rentals/wall-time";
import { civilDateToUtcDate } from "@/lib/time/location-timezone";
import { stationLabel } from "@/lib/stations/display";
import { sendRentalEmail } from "@/lib/notifications/rental-email";
import type {
  RentalBookingType,
  RentalPaymentProvider,
  RentalPaymentStatus,
  Role,
} from "@/generated/prisma/enums";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const staffRentalBookingSchema = z
  .object({
    roomId: z.string().uuid(),
    date: z.string().regex(DATE_RE),
    timeStart: z.string().regex(TIME_RE),
    timeEnd: z.string().regex(TIME_RE),
    /** staff = internal block (free); client = phone / walk-in renter (paid). */
    kind: z.enum(["staff", "client"]).default("staff"),
    bookingType: z.enum(["prive", "b2b"]).default("prive"),
    clientName: z.string().trim().min(1).max(120),
    clientEmail: z.string().trim().email().max(200).optional(),
    clientPhone: z.string().trim().max(40).optional(),
    clientOrg: z.string().trim().max(160).optional(),
    paymentProvider: z.enum(["interac", "cash", "paypal"]).default("interac"),
    paidNow: z.boolean().default(false),
    /** Negotiated total; defaults to the room's hourly rate × duration. */
    priceCents: z.number().int().min(0).max(10_000_000).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.kind === "staff" || Boolean(v.clientEmail || v.clientPhone), {
    message: "contact_required",
    path: ["clientEmail"],
  });

const OUTSTANDING_PAYMENT: RentalPaymentStatus[] = ["NONE", "PENDING_INTERAC", "PENDING_PAYPAL"];

class SlotUnavailableError extends Error {
  constructor() {
    super("slot_unavailable");
  }
}

class NotPendingError extends Error {
  constructor() {
    super("not_pending");
  }
}

export const rentalSettingsPatchSchema = z.object({
  openHour: z.number().int().min(0).max(23).optional(),
  closeHour: z.number().int().min(1).max(24).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  minLeadHours: z.number().int().min(0).max(168).optional(),
  b2bRequiresApproval: z.boolean().optional(),
  durationOptions: z.array(z.number().int().positive()).min(1).max(12).optional(),
  moduleEnabled: z.boolean().optional(),
  rooms: z
    .array(
      z.object({
        roomId: z.string().uuid(),
        hourlyRateCents: z.number().int().min(0).optional(),
        rentable: z.boolean().optional(),
        floorId: z.string().uuid().nullable().optional(),
        rentalDescription: z.string().max(4000).nullable().optional(),
        dimensions: z.string().max(200).nullable().optional(),
        amenities: z.array(z.string().max(80)).max(40).optional(),
        courseRoomIndex: z.number().int().min(0).max(99).nullable().optional(),
      }),
    )
    .optional(),
});

async function requireManagerLocation(userId: string, role: Role) {
  if (!canAccessManagerSettings(role)) return null;
  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;
  return membership;
}

function mapBooking(row: {
  id: string;
  locationId: string;
  roomId: string;
  date: Date;
  timeStart: string;
  timeEnd: string;
  type: string;
  status: string;
  paymentStatus: string;
  paymentProvider: string | null;
  priceCents: number;
  currency: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  clientOrg: string | null;
  notes: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  room?: { nameFr: string; nameEn: string; nameEs: string; slug: string | null };
}) {
  return {
    id: row.id,
    locationId: row.locationId,
    roomId: row.roomId,
    roomName: row.room ? stationLabel(row.room, "fr") : null,
    date: civilDateFromDbDate(row.date),
    timeStart: row.timeStart,
    timeEnd: row.timeEnd,
    type: row.type.toLowerCase(),
    status: row.status.toLowerCase(),
    paymentStatus: row.paymentStatus.toLowerCase(),
    paymentProvider: row.paymentProvider?.toLowerCase() ?? null,
    priceCents: row.priceCents,
    currency: row.currency,
    client: {
      name: row.clientName,
      email: row.clientEmail,
      phone: row.clientPhone,
      org: row.clientOrg,
    },
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

export async function listStudioRentalBookings(input: {
  userId: string;
  role: Role;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  roomId?: string | null;
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const status = input.status?.toUpperCase();
  await releaseExpiredRentalHolds({ locationId: membership.locationId });
  const rows = await prisma.rentalBooking.findMany({
    where: {
      locationId: membership.locationId,
      ...(status && ["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"].includes(status)
        ? { status: status as "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" }
        : {}),
      ...(input.roomId ? { roomId: input.roomId } : {}),
      ...(input.from || input.to
        ? {
            date: {
              ...(input.from ? { gte: civilDateToUtcDate(input.from) } : {}),
              ...(input.to ? { lte: civilDateToUtcDate(input.to) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "asc" }, { timeStart: "asc" }],
    include: { room: true },
    take: 200,
  });

  return { ok: true as const, bookings: rows.map(mapBooking) };
}

export async function listPendingB2bBookings(userId: string, role: Role) {
  const membership = await requireManagerLocation(userId, role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const rows = await prisma.rentalBooking.findMany({
    where: {
      locationId: membership.locationId,
      type: "B2B",
      status: "PENDING",
      paymentStatus: "PENDING_APPROVAL",
    },
    orderBy: [{ createdAt: "asc" }],
    include: { room: true },
  });

  return { ok: true as const, bookings: rows.map(mapBooking) };
}

export async function approveRentalBooking(input: {
  userId: string;
  role: Role;
  bookingId: string;
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const existing = await prisma.rentalBooking.findFirst({
    where: { id: input.bookingId, locationId: membership.locationId },
    include: { room: true },
  });
  if (!existing) return { ok: false as const, error: "booking_not_found", status: 404 };
  if (existing.status !== "PENDING") {
    return { ok: false as const, error: "not_pending", status: 409 };
  }

  const date = civilDateFromDbDate(existing.date);
  await releaseExpiredRentalHolds({ roomId: existing.roomId });
  const settings = await prisma.locationRentalSettings.findUnique({
    where: { locationId: membership.locationId },
  });
  const bufferMinutes = settings?.bufferMinutes ?? DEFAULT_RENTAL_SETTINGS.bufferMinutes;

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await lockRoomForBooking(tx, existing.roomId);
      const current = await tx.rentalBooking.findUnique({
        where: { id: existing.id },
        select: { status: true },
      });
      if (current?.status !== "PENDING") throw new NotPendingError();
      // A class may have been scheduled into the slot while the request waited.
      const [classes, bookings] = await Promise.all([
        loadClassOccupancy(membership.locationId),
        loadBookingOccupancy(tx, existing.roomId, date, date, { excludeId: existing.id }),
      ]);
      const slot = isSlotAvailable({
        classes,
        bookings,
        roomId: existing.roomId,
        dateIso: date,
        timeStart: existing.timeStart,
        timeEnd: existing.timeEnd,
        bufferMinutes,
      });
      if (!slot.ok) throw new SlotUnavailableError();
      return tx.rentalBooking.update({
        where: { id: existing.id },
        data: {
          status: "CONFIRMED",
          paymentStatus:
            existing.paymentStatus === "PENDING_APPROVAL"
              ? existing.paymentProvider === "PAYPAL"
                ? "PENDING_PAYPAL"
                : existing.paymentProvider === "CASH"
                  ? "NONE"
                  : "PENDING_INTERAC"
              : existing.paymentStatus,
          confirmedAt: new Date(),
          confirmedById: input.userId,
        },
        include: { room: true },
      });
    });
  } catch (error) {
    if (error instanceof NotPendingError) {
      return { ok: false as const, error: "not_pending", status: 409 };
    }
    if (error instanceof SlotUnavailableError) {
      return { ok: false as const, error: "slot_unavailable", status: 409 };
    }
    throw error;
  }

  void sendRentalEmail({
    to: updated.clientEmail,
    kind: "b2b_approved",
    subject: `Demande approuvée — ${stationLabel(updated.room, "fr")}`,
    text: [
      `Votre demande de location a été approuvée.`,
      `Salle: ${stationLabel(updated.room, "fr")}`,
      `Date: ${civilDateFromDbDate(updated.date)} ${updated.timeStart}–${updated.timeEnd}`,
      `Montant: ${(updated.priceCents / 100).toFixed(2)} ${updated.currency}`,
      updated.paymentStatus === "PENDING_INTERAC"
        ? "Veuillez procéder au paiement Interac."
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
    meta: { bookingId: updated.id },
  });

  return { ok: true as const, booking: mapBooking(updated) };
}

export async function rejectRentalBooking(input: {
  userId: string;
  role: Role;
  bookingId: string;
  reason?: string;
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const existing = await prisma.rentalBooking.findFirst({
    where: { id: input.bookingId, locationId: membership.locationId },
    include: { room: true },
  });
  if (!existing) return { ok: false as const, error: "booking_not_found", status: 404 };
  if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
    return { ok: false as const, error: "already_cancelled", status: 409 };
  }

  const wasConfirmed = existing.status === "CONFIRMED";
  const updated = await prisma.rentalBooking.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      // PAID stays PAID so the studio still sees a refund may be owed.
      paymentStatus: existing.paymentStatus === "PAID" ? "PAID" : "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: input.userId,
      cancellationReason: input.reason?.trim() || null,
    },
    include: { room: true },
  });

  if (existing.type !== "STAFF") {
    void sendRentalEmail({
      to: updated.clientEmail,
      kind: wasConfirmed ? "rental_cancelled" : "b2b_rejected",
      subject: wasConfirmed
        ? `Location annulée — ${stationLabel(updated.room, "fr")}`
        : `Demande refusée — ${stationLabel(updated.room, "fr")}`,
      text: [
        wasConfirmed
          ? `Votre location a été annulée par le studio.`
          : `Votre demande de location n'a pas pu être acceptée.`,
        `Salle: ${stationLabel(updated.room, "fr")}`,
        `Date: ${civilDateFromDbDate(updated.date)} ${updated.timeStart}–${updated.timeEnd}`,
        input.reason ? `Motif: ${input.reason}` : null,
        wasConfirmed && existing.paymentStatus === "PAID"
          ? "Le studio vous contactera pour le remboursement."
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      meta: { bookingId: updated.id },
    });
  }

  return { ok: true as const, booking: mapBooking(updated) };
}

export async function markRentalPaid(input: {
  userId: string;
  role: Role;
  bookingId: string;
  provider: "interac" | "cash" | "paypal";
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  await releaseExpiredRentalHolds({ locationId: membership.locationId });
  const now = new Date();
  // Conditional update: two staff clicking "paid" at once settle it exactly once,
  // and a hold that lapsed (its slot may be resold) can't be revived by a late payment.
  const { count } = await prisma.rentalBooking.updateMany({
    where: {
      id: input.bookingId,
      locationId: membership.locationId,
      status: "CONFIRMED",
      paymentStatus: { in: OUTSTANDING_PAYMENT },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: {
      paymentStatus: "PAID",
      paymentProvider: input.provider.toUpperCase() as RentalPaymentProvider,
      expiresAt: null,
    },
  });
  if (count === 0) {
    const current = await prisma.rentalBooking.findFirst({
      where: { id: input.bookingId, locationId: membership.locationId },
      select: { status: true },
    });
    return current?.status === "EXPIRED"
      ? { ok: false as const, error: "hold_expired", status: 409 }
      : { ok: false as const, error: "not_payable", status: 409 };
  }

  const updated = await prisma.rentalBooking.findUniqueOrThrow({
    where: { id: input.bookingId },
    include: { room: true },
  });

  void sendRentalEmail({
    to: updated.clientEmail,
    kind: "rental_paid",
    subject: `Paiement reçu — ${stationLabel(updated.room, "fr")}`,
    text: [
      `Nous avons bien reçu votre paiement. Merci!`,
      `Salle: ${stationLabel(updated.room, "fr")}`,
      `Date: ${civilDateFromDbDate(updated.date)} ${updated.timeStart}–${updated.timeEnd}`,
      `Montant: ${(updated.priceCents / 100).toFixed(2)} ${updated.currency}`,
    ].join("\n"),
    meta: { bookingId: updated.id },
  });

  return { ok: true as const, booking: mapBooking(updated) };
}

export async function createStaffRentalBooking(input: {
  userId: string;
  role: Role;
  payload: z.infer<typeof staffRentalBookingSchema>;
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const payload = input.payload;
  const room = await prisma.station.findFirst({
    where: {
      id: payload.roomId,
      locationId: membership.locationId,
      kind: "ROOM",
      isActive: true,
    },
  });
  if (!room) return { ok: false as const, error: "room_not_found", status: 404 };

  const windowError = validateRentalWindow({
    timeStart: payload.timeStart,
    timeEnd: payload.timeEnd,
    openHour: 0,
    closeHour: 24,
    mode: "staff",
  });
  if (windowError) return { ok: false as const, error: windowError, status: 400 };
  if (payload.date < todayIsoInTimeZone(membership.location.timezone)) {
    return { ok: false as const, error: "date_in_past", status: 400 };
  }

  const settingsRow = await prisma.locationRentalSettings.findUnique({
    where: { locationId: membership.locationId },
  });
  const bufferMinutes = settingsRow?.bufferMinutes ?? DEFAULT_RENTAL_SETTINGS.bufferMinutes;
  const durationMinutes = parseMinutes(payload.timeEnd)! - parseMinutes(payload.timeStart)!;

  const isClient = payload.kind === "client";
  const priceCents = isClient
    ? (payload.priceCents ?? estimateRentalPriceCents(room.hourlyRateCents ?? 0, durationMinutes))
    : 0;
  const type: RentalBookingType = !isClient ? "STAFF" : payload.bookingType === "b2b" ? "B2B" : "PRIVE";
  const paymentStatus: RentalPaymentStatus = !isClient
    ? "WAIVED_STAFF"
    : payload.paidNow || priceCents === 0
      ? "PAID"
      : payload.paymentProvider === "paypal"
        ? "PENDING_PAYPAL"
        : payload.paymentProvider === "cash"
          ? "NONE"
          : "PENDING_INTERAC";

  await releaseExpiredRentalHolds({ roomId: room.id });
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      await lockRoomForBooking(tx, room.id);
      const [classes, bookings] = await Promise.all([
        loadClassOccupancy(membership.locationId),
        loadBookingOccupancy(tx, room.id, payload.date, payload.date),
      ]);
      const slot = isSlotAvailable({
        classes,
        bookings,
        roomId: room.id,
        dateIso: payload.date,
        timeStart: payload.timeStart,
        timeEnd: payload.timeEnd,
        bufferMinutes,
      });
      if (!slot.ok) throw new SlotUnavailableError();

      return tx.rentalBooking.create({
        data: {
          locationId: membership.locationId,
          roomId: room.id,
          date: civilDateToUtcDate(payload.date),
          timeStart: payload.timeStart,
          timeEnd: payload.timeEnd,
          type,
          status: "CONFIRMED",
          paymentStatus,
          paymentProvider: isClient
            ? (payload.paymentProvider.toUpperCase() as RentalPaymentProvider)
            : null,
          priceCents,
          currency: room.currency || "CAD",
          clientName: payload.clientName,
          clientEmail: payload.clientEmail?.trim() || (isClient ? "" : "staff@internal"),
          clientPhone: payload.clientPhone?.trim() || null,
          clientOrg: payload.clientOrg?.trim() || null,
          notes: payload.notes ?? null,
          confirmedAt: new Date(),
          confirmedById: input.userId,
        },
        include: { room: true },
      });
    });
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      return { ok: false as const, error: "slot_unavailable", status: 409 };
    }
    throw error;
  }

  if (isClient && created.clientEmail) {
    void sendRentalEmail({
      to: created.clientEmail,
      kind: "rental_confirmed",
      subject: `Confirmation — location ${stationLabel(created.room, "fr")}`,
      text: [
        `Votre réservation est confirmée.`,
        `Salle: ${stationLabel(created.room, "fr")}`,
        `Date: ${payload.date} ${created.timeStart}–${created.timeEnd}`,
        `Montant: ${(priceCents / 100).toFixed(2)} ${created.currency}`,
        created.paymentStatus === "PAID"
          ? "Paiement: reçu."
          : created.paymentStatus === "PENDING_INTERAC"
            ? "Paiement: Interac e-Transfer à envoyer au studio."
            : null,
      ]
        .filter(Boolean)
        .join("\n"),
      meta: { bookingId: created.id },
    });
  }

  return { ok: true as const, booking: mapBooking(created) };
}

export async function patchRentalSettings(input: {
  userId: string;
  role: Role;
  payload: z.infer<typeof rentalSettingsPatchSchema>;
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const {
    openHour,
    closeHour,
    bufferMinutes,
    minLeadHours,
    b2bRequiresApproval,
    durationOptions,
    moduleEnabled,
    rooms,
  } = input.payload;

  if (openHour != null && closeHour != null && openHour >= closeHour) {
    return { ok: false as const, error: "invalid_hours", status: 400 };
  }

  if (rooms?.some((r) => r.rentable)) {
    const current = await prisma.station.findMany({
      where: { id: { in: rooms.map((r) => r.roomId) }, locationId: membership.locationId },
      select: { id: true, hourlyRateCents: true, rentable: true },
    });
    const byId = new Map(current.map((r) => [r.id, r]));
    const unpriced = rooms.some((r) => {
      const existing = byId.get(r.roomId);
      const rentable = r.rentable ?? existing?.rentable ?? false;
      const rate = r.hourlyRateCents ?? existing?.hourlyRateCents ?? 0;
      return rentable && rate <= 0;
    });
    if (unpriced) return { ok: false as const, error: "rate_required", status: 400 };
  }

  const settings = await prisma.locationRentalSettings.upsert({
    where: { locationId: membership.locationId },
    create: {
      locationId: membership.locationId,
      openHour: openHour ?? DEFAULT_RENTAL_SETTINGS.openHour,
      closeHour: closeHour ?? DEFAULT_RENTAL_SETTINGS.closeHour,
      bufferMinutes: bufferMinutes ?? DEFAULT_RENTAL_SETTINGS.bufferMinutes,
      minLeadHours: minLeadHours ?? DEFAULT_RENTAL_SETTINGS.minLeadHours,
      b2bRequiresApproval: b2bRequiresApproval ?? DEFAULT_RENTAL_SETTINGS.b2bRequiresApproval,
      durationOptions: durationOptions ?? [...DEFAULT_RENTAL_SETTINGS.durationOptions],
      moduleEnabled: moduleEnabled ?? false,
    },
    update: {
      ...(openHour != null ? { openHour } : {}),
      ...(closeHour != null ? { closeHour } : {}),
      ...(bufferMinutes != null ? { bufferMinutes } : {}),
      ...(minLeadHours != null ? { minLeadHours } : {}),
      ...(b2bRequiresApproval != null ? { b2bRequiresApproval } : {}),
      ...(durationOptions != null ? { durationOptions } : {}),
      ...(moduleEnabled != null ? { moduleEnabled } : {}),
    },
  });

  if (rooms?.length) {
    for (const room of rooms) {
      await prisma.station.updateMany({
        where: {
          id: room.roomId,
          locationId: membership.locationId,
          kind: "ROOM",
        },
        data: {
          ...(room.hourlyRateCents != null ? { hourlyRateCents: room.hourlyRateCents } : {}),
          ...(room.rentable != null ? { rentable: room.rentable } : {}),
          ...(room.floorId !== undefined ? { floorId: room.floorId } : {}),
          ...(room.rentalDescription !== undefined
            ? { rentalDescription: room.rentalDescription }
            : {}),
          ...(room.dimensions !== undefined ? { dimensions: room.dimensions } : {}),
          ...(room.amenities != null ? { amenities: room.amenities } : {}),
          ...(room.courseRoomIndex !== undefined
            ? { courseRoomIndex: room.courseRoomIndex }
            : {}),
        },
      });
    }
  }

  return {
    ok: true as const,
    settings: {
      openHour: settings.openHour,
      closeHour: settings.closeHour,
      bufferMinutes: settings.bufferMinutes,
      minLeadHours: settings.minLeadHours,
      b2bRequiresApproval: settings.b2bRequiresApproval,
      durationOptions: settings.durationOptions,
      moduleEnabled: settings.moduleEnabled,
    },
  };
}

export async function getStudioRoomCalendar(input: {
  userId: string;
  role: Role;
  roomId: string;
  date: string;
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };
  if (!DATE_RE.test(input.date)) return { ok: false as const, error: "invalid_date", status: 400 };

  const room = await prisma.station.findFirst({
    where: { id: input.roomId, locationId: membership.locationId, kind: "ROOM" },
  });
  if (!room) return { ok: false as const, error: "room_not_found", status: 404 };

  const settingsRow = await prisma.locationRentalSettings.findUnique({
    where: { locationId: membership.locationId },
  });
  const openHour = settingsRow?.openHour ?? DEFAULT_RENTAL_SETTINGS.openHour;
  const closeHour = settingsRow?.closeHour ?? DEFAULT_RENTAL_SETTINGS.closeHour;
  const bufferMinutes = settingsRow?.bufferMinutes ?? DEFAULT_RENTAL_SETTINGS.bufferMinutes;

  await releaseExpiredRentalHolds({ roomId: room.id });
  const [classes, bookings, existing] = await Promise.all([
    loadClassOccupancy(membership.locationId),
    loadBookingOccupancy(prisma, room.id, input.date, input.date),
    prisma.rentalBooking.findMany({
      where: {
        roomId: room.id,
        date: civilDateToUtcDate(input.date),
        ...occupyingBookingWhere(),
      },
    }),
  ]);

  const timeline = buildRoomDayTimeline({
    classes,
    bookings,
    roomId: room.id,
    dateIso: input.date,
    openHour,
    closeHour,
    bufferMinutes,
  });

  return {
    ok: true as const,
    room: {
      id: room.id,
      name: stationLabel(room, "fr"),
      hourlyRateCents: room.hourlyRateCents,
    },
    date: input.date,
    timeline,
    bookings: existing.map(mapBooking),
  };
}

export async function listInteracPending(input: {
  userId: string;
  role: Role;
  kind?: "rental" | "enrollment" | "all";
}) {
  const membership = await requireManagerLocation(input.userId, input.role);
  if (!membership) return { ok: false as const, error: "unauthorized", status: 401 };

  const kind = input.kind ?? "all";
  if (kind !== "enrollment") await releaseExpiredRentalHolds({ locationId: membership.locationId });
  const rentals =
    kind === "enrollment"
      ? []
      : (
          await prisma.rentalBooking.findMany({
            where: {
              locationId: membership.locationId,
              paymentStatus: "PENDING_INTERAC",
              status: { notIn: ["CANCELLED", "EXPIRED"] },
            },
            orderBy: [{ createdAt: "asc" }],
            include: { room: true },
            take: 100,
          })
        ).map((r) => ({
          kind: "rental" as const,
          id: r.id,
          clientName: r.clientName,
          clientEmail: r.clientEmail,
          amountCents: r.priceCents,
          currency: r.currency,
          createdAt: r.createdAt.toISOString(),
          label: `${stationLabel(r.room, "fr")} · ${civilDateFromDbDate(r.date)} ${r.timeStart}`,
        }));

  const enrollments =
    kind === "rental"
      ? []
      : (
          await prisma.enrollment.findMany({
            where: {
              paymentStatus: "PENDING_INTERAC",
              waitlisted: false,
              session: {
                OR: [
                  { season: { locationId: membership.locationId } },
                  { seasonId: null, room: { locationId: membership.locationId } },
                ],
              },
            },
            orderBy: [{ paymentPendingAt: "asc" }, { createdAt: "asc" }],
            include: {
              student: { select: { fullName: true, email: true } },
              session: { select: { course: { select: { title: true } } } },
            },
            take: 100,
          })
        ).map((e) => ({
          kind: "enrollment" as const,
          id: e.id,
          clientName: e.student.fullName,
          clientEmail: e.student.email,
          amountCents: Math.round(Number(e.amountCad ?? 0) * 100),
          currency: e.currency || "CAD",
          createdAt: e.createdAt.toISOString(),
          label: e.session.course.title,
        }));

  return {
    ok: true as const,
    items: kind === "rental" ? rentals : kind === "enrollment" ? enrollments : [...enrollments, ...rentals],
  };
}

export async function getRentalsDashboardData(userId: string, role: Role) {
  const membership = await requireManagerLocation(userId, role);
  if (!membership) return null;

  const todayIso = todayIsoInTimeZone(membership.location.timezone);
  await releaseExpiredRentalHolds({ locationId: membership.locationId });
  const [
    settings,
    pending,
    upcoming,
    awaitingPayment,
    rooms,
    floors,
    draftSeasons,
    recentlyExpired,
  ] = await Promise.all([
    prisma.locationRentalSettings.findUnique({ where: { locationId: membership.locationId } }),
    prisma.rentalBooking.findMany({
      where: {
        locationId: membership.locationId,
        type: "B2B",
        status: "PENDING",
      },
      orderBy: [{ createdAt: "asc" }],
      include: { room: true },
      take: 50,
    }),
    prisma.rentalBooking.findMany({
      where: {
        locationId: membership.locationId,
        status: "CONFIRMED",
        date: { gte: civilDateToUtcDate(todayIso) },
      },
      orderBy: [{ date: "asc" }, { timeStart: "asc" }],
      include: { room: true },
      take: 60,
    }),
    // Past bookings still unpaid stay here until someone settles them.
    prisma.rentalBooking.findMany({
      where: {
        locationId: membership.locationId,
        status: "CONFIRMED",
        paymentStatus: { in: OUTSTANDING_PAYMENT },
        priceCents: { gt: 0 },
      },
      orderBy: [{ date: "asc" }, { timeStart: "asc" }],
      include: { room: true },
      take: 100,
    }),
    prisma.station.findMany({
      where: { locationId: membership.locationId, kind: "ROOM", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
    prisma.floor.findMany({
      where: { locationId: membership.locationId },
      orderBy: [{ sortOrder: "asc" }],
    }),
    // Draft seasons block rentals on their dates (next term's grid); surface
    // them so a forgotten draft doesn't silently eat rentable hours.
    prisma.sessionSeason.findMany({
      where: {
        locationId: membership.locationId,
        status: "DRAFT",
        endsOn: { gte: civilDateToUtcDate(todayIso) },
      },
      orderBy: [{ startsOn: "asc" }],
      select: {
        id: true,
        name: true,
        startsOn: true,
        endsOn: true,
        _count: { select: { classes: { where: { room: { rentable: true } } } } },
      },
    }),
    prisma.rentalBooking.findMany({
      where: {
        locationId: membership.locationId,
        status: "EXPIRED",
        cancelledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: [{ cancelledAt: "desc" }],
      include: { room: true },
      take: 10,
    }),
  ]);

  return {
    locationId: membership.locationId,
    timezone: membership.location.timezone,
    settings: settings
      ? {
          openHour: settings.openHour,
          closeHour: settings.closeHour,
          bufferMinutes: settings.bufferMinutes,
          minLeadHours: settings.minLeadHours,
          b2bRequiresApproval: settings.b2bRequiresApproval,
          durationOptions: settings.durationOptions,
          moduleEnabled: settings.moduleEnabled,
        }
      : {
          ...DEFAULT_RENTAL_SETTINGS,
          durationOptions: [...DEFAULT_RENTAL_SETTINGS.durationOptions],
        },
    todayIso,
    pending: pending.map(mapBooking),
    upcoming: upcoming.map(mapBooking),
    awaitingPayment: awaitingPayment.map(mapBooking),
    recentlyExpired: recentlyExpired.map(mapBooking),
    draftSeasons: draftSeasons
      .filter((s) => s._count.classes > 0)
      .map((s) => ({
        id: s.id,
        name: s.name,
        startsOn: civilDateFromDbDate(s.startsOn),
        endsOn: civilDateFromDbDate(s.endsOn),
        classCount: s._count.classes,
      })),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: stationLabel(r, "fr"),
      slug: r.slug,
      capacity: r.capacity,
      rentable: r.rentable,
      hourlyRateCents: r.hourlyRateCents,
      floorId: r.floorId,
      courseRoomIndex: r.courseRoomIndex,
      dimensions: r.dimensions,
      amenities: r.amenities,
      rentalDescription: r.rentalDescription,
    })),
    floors: floors.map((f) => ({
      id: f.id,
      label: f.label,
      shortLabel: f.shortLabel,
      sortOrder: f.sortOrder,
    })),
  };
}

export { estimateRentalPriceCents };
