import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canAccessManagerSettings } from "@/lib/auth/session-client";
import { DEFAULT_RENTAL_SETTINGS } from "@/lib/rentals/defaults";
import {
  buildRoomDayTimeline,
  estimateRentalPriceCents,
  isSlotAvailable,
  type BookingOccupancyInput,
  type ClassOccupancyInput,
} from "@/lib/rentals/schedule";
import { civilDateFromDbDate, hhmmFromUtcDate } from "@/lib/rentals/wall-time";
import { civilDateToUtcDate } from "@/lib/time/location-timezone";
import { stationLabel } from "@/lib/stations/display";
import { sendRentalEmail } from "@/lib/notifications/rental-email";
import type { Role } from "@/generated/prisma/enums";

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const staffRentalBookingSchema = z.object({
  roomId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  timeStart: z.string().regex(TIME_RE),
  timeEnd: z.string().regex(TIME_RE),
  clientName: z.string().trim().min(1).max(120),
  clientEmail: z.string().trim().email().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

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

async function loadPublishedClasses(locationId: string): Promise<ClassOccupancyInput[]> {
  const activeSeason = await prisma.sessionSeason.findFirst({
    where: { locationId, status: "ACTIVE" },
    orderBy: { startsOn: "desc" },
    select: { id: true },
  });

  const seasonFilter = activeSeason
    ? {
        OR: [
          { seasonId: activeSeason.id },
          { seasonId: null, room: { locationId } },
        ],
      }
    : { room: { locationId } };

  const rows = await prisma.classSession.findMany({
    where: seasonFilter,
    select: {
      roomId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      course: { select: { title: true } },
    },
  });

  return rows.map((r) => ({
    roomId: r.roomId,
    dayOfWeek: r.dayOfWeek,
    timeStart: hhmmFromUtcDate(r.startTime),
    timeEnd: hhmmFromUtcDate(r.endTime),
    label: r.course.title,
  }));
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
  const rows = await prisma.rentalBooking.findMany({
    where: {
      locationId: membership.locationId,
      ...(status && ["PENDING", "CONFIRMED", "CANCELLED"].includes(status)
        ? { status: status as "PENDING" | "CONFIRMED" | "CANCELLED" }
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

  const updated = await prisma.rentalBooking.update({
    where: { id: existing.id },
    data: {
      status: "CONFIRMED",
      paymentStatus:
        existing.paymentStatus === "PENDING_APPROVAL"
          ? "PENDING_INTERAC"
          : existing.paymentStatus,
      confirmedAt: new Date(),
      confirmedById: input.userId,
    },
    include: { room: true },
  });

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
  if (existing.status === "CANCELLED") {
    return { ok: false as const, error: "already_cancelled", status: 409 };
  }

  const updated = await prisma.rentalBooking.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      paymentStatus: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: input.userId,
      cancellationReason: input.reason?.trim() || null,
    },
    include: { room: true },
  });

  void sendRentalEmail({
    to: updated.clientEmail,
    kind: "b2b_rejected",
    subject: `Demande refusée — ${stationLabel(updated.room, "fr")}`,
    text: [
      `Votre demande de location n'a pas pu être acceptée.`,
      `Salle: ${stationLabel(updated.room, "fr")}`,
      `Date: ${civilDateFromDbDate(updated.date)} ${updated.timeStart}–${updated.timeEnd}`,
      input.reason ? `Motif: ${input.reason}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
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

  const room = await prisma.station.findFirst({
    where: {
      id: input.payload.roomId,
      locationId: membership.locationId,
      kind: "ROOM",
      isActive: true,
    },
  });
  if (!room) return { ok: false as const, error: "room_not_found", status: 404 };

  const settingsRow = await prisma.locationRentalSettings.findUnique({
    where: { locationId: membership.locationId },
  });
  const bufferMinutes = settingsRow?.bufferMinutes ?? DEFAULT_RENTAL_SETTINGS.bufferMinutes;

  const startMin =
    Number(input.payload.timeStart.split(":")[0]) * 60 +
    Number(input.payload.timeStart.split(":")[1]);
  const endMin =
    Number(input.payload.timeEnd.split(":")[0]) * 60 + Number(input.payload.timeEnd.split(":")[1]);
  if (endMin <= startMin) return { ok: false as const, error: "invalid_time_range", status: 400 };

  const classes = await loadPublishedClasses(membership.locationId);
  const existing = await prisma.rentalBooking.findMany({
    where: {
      roomId: room.id,
      date: civilDateToUtcDate(input.payload.date),
      status: { not: "CANCELLED" },
    },
  });
  const bookings: BookingOccupancyInput[] = existing.map((r) => ({
    roomId: r.roomId,
    date: civilDateFromDbDate(r.date),
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    type: r.type.toLowerCase() as "prive" | "b2b" | "staff",
    status: r.status.toLowerCase(),
  }));

  const slot = isSlotAvailable({
    classes,
    bookings,
    roomId: room.id,
    dateIso: input.payload.date,
    timeStart: input.payload.timeStart,
    timeEnd: input.payload.timeEnd,
    bufferMinutes,
  });
  if (!slot.ok) return { ok: false as const, error: "slot_unavailable", status: 409 };

  const created = await prisma.rentalBooking.create({
    data: {
      locationId: membership.locationId,
      roomId: room.id,
      date: civilDateToUtcDate(input.payload.date),
      timeStart: input.payload.timeStart,
      timeEnd: input.payload.timeEnd,
      type: "STAFF",
      status: "CONFIRMED",
      paymentStatus: "WAIVED_STAFF",
      priceCents: 0,
      currency: room.currency || "CAD",
      clientName: input.payload.clientName,
      clientEmail: input.payload.clientEmail?.trim() || "staff@internal",
      notes: input.payload.notes ?? null,
      confirmedAt: new Date(),
      confirmedById: input.userId,
    },
    include: { room: true },
  });

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

  const classes = await loadPublishedClasses(membership.locationId);
  const existing = await prisma.rentalBooking.findMany({
    where: {
      roomId: room.id,
      date: civilDateToUtcDate(input.date),
      status: { not: "CANCELLED" },
    },
  });
  const bookings: BookingOccupancyInput[] = existing.map((r) => ({
    roomId: r.roomId,
    date: civilDateFromDbDate(r.date),
    timeStart: r.timeStart,
    timeEnd: r.timeEnd,
    type: r.type.toLowerCase() as "prive" | "b2b" | "staff",
    status: r.status.toLowerCase(),
  }));

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
  const rentals =
    kind === "enrollment"
      ? []
      : (
          await prisma.rentalBooking.findMany({
            where: {
              locationId: membership.locationId,
              paymentStatus: "PENDING_INTERAC",
              status: { not: "CANCELLED" },
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

  const [settings, pending, upcoming, rooms, floors] = await Promise.all([
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
        date: { gte: civilDateToUtcDate(new Date().toISOString().slice(0, 10)) },
      },
      orderBy: [{ date: "asc" }, { timeStart: "asc" }],
      include: { room: true },
      take: 15,
    }),
    prisma.station.findMany({
      where: { locationId: membership.locationId, kind: "ROOM", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
    }),
    prisma.floor.findMany({
      where: { locationId: membership.locationId },
      orderBy: [{ sortOrder: "asc" }],
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
    pending: pending.map(mapBooking),
    upcoming: upcoming.map(mapBooking),
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
