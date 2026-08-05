import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePublicLocation } from "@/lib/public-api/tenant";
import { DEFAULT_RENTAL_SETTINGS, type RentalSettingsView } from "@/lib/rentals/defaults";
import {
  buildRoomDayTimeline,
  estimateRentalPriceCents,
  getAvailableStartTimes,
  getDayAvailabilitySummary,
  getMonthAvailability,
  isSlotAvailable,
  todayIsoInTimeZone,
  violatesMinLead,
  type BookingOccupancyInput,
  type ClassOccupancyInput,
} from "@/lib/rentals/schedule";
import { civilDateFromDbDate, hhmmFromUtcDate } from "@/lib/rentals/wall-time";
import { civilDateToUtcDate } from "@/lib/time/location-timezone";
import { stationLabel } from "@/lib/stations/display";
import { sendRentalEmail } from "@/lib/notifications/rental-email";
import type {
  RentalBookingStatus,
  RentalBookingType,
  RentalPaymentProvider,
  RentalPaymentStatus,
} from "@/generated/prisma/enums";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export const publicRentalBookingSchema = z.object({
  roomId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  timeStart: z.string().regex(TIME_RE),
  timeEnd: z.string().regex(TIME_RE),
  type: z.enum(["prive", "b2b"]),
  paymentProvider: z.enum(["interac", "paypal", "cash"]).optional(),
  client: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional(),
    org: z.string().trim().max(160).optional(),
  }),
  notes: z.string().trim().max(2000).optional(),
  locationId: z.string().uuid().optional(),
  locationSlug: z.string().trim().min(1).max(80).optional(),
  organizationSlug: z.string().trim().min(1).max(80).optional(),
});

export type PublicRentalBookingInput = z.infer<typeof publicRentalBookingSchema>;

function mapSettings(row: {
  openHour: number;
  closeHour: number;
  bufferMinutes: number;
  minLeadHours: number;
  b2bRequiresApproval: boolean;
  durationOptions: number[];
  moduleEnabled: boolean;
} | null): RentalSettingsView {
  if (!row) return { ...DEFAULT_RENTAL_SETTINGS, durationOptions: [...DEFAULT_RENTAL_SETTINGS.durationOptions] };
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

async function loadRentalSettings(locationId: string): Promise<RentalSettingsView> {
  const row = await prisma.locationRentalSettings.findUnique({ where: { locationId } });
  return mapSettings(row);
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

async function loadBookingOccupancy(
  roomId: string,
  fromDate: string,
  toDate: string,
): Promise<BookingOccupancyInput[]> {
  const rows = await prisma.rentalBooking.findMany({
    where: {
      roomId,
      date: {
        gte: civilDateToUtcDate(fromDate),
        lte: civilDateToUtcDate(toDate),
      },
      status: { not: "CANCELLED" },
    },
    select: {
      roomId: true,
      date: true,
      timeStart: true,
      timeEnd: true,
      type: true,
      status: true,
    },
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

export async function getPublicRentalRooms(input: {
  locationId?: string | null;
  locationSlug?: string | null;
  organizationSlug?: string | null;
}): Promise<
  | { ok: true; locationId: string; settings: RentalSettingsView; floors: unknown[] }
  | { ok: false; error: string; status: number }
> {
  const location = await resolvePublicLocation(input);
  if (!location) return { ok: false, error: "location_not_found", status: 404 };

  const settings = await loadRentalSettings(location.id);
  if (!settings.moduleEnabled) {
    return { ok: false, error: "rental_module_disabled", status: 404 };
  }

  const [floors, rooms] = await Promise.all([
    prisma.floor.findMany({
      where: { locationId: location.id },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.station.findMany({
      where: {
        locationId: location.id,
        kind: "ROOM",
        isActive: true,
        rentable: true,
      },
      orderBy: [{ sortOrder: "asc" }, { nameFr: "asc" }],
      include: { floor: true },
    }),
  ]);

  const floorBuckets = new Map<
    string,
    { id: string; label: string; shortLabel: string | null; rooms: unknown[] }
  >();

  for (const f of floors) {
    floorBuckets.set(f.id, {
      id: f.id,
      label: f.label,
      shortLabel: f.shortLabel,
      rooms: [],
    });
  }

  const ungrouped = {
    id: "ungrouped",
    label: "Salles",
    shortLabel: null as string | null,
    rooms: [] as unknown[],
  };

  for (const room of rooms) {
    const publicRoom = {
      id: room.id,
      name: stationLabel(room, "fr"),
      slug: room.slug,
      capacity: room.capacity,
      hourlyRateCents: room.hourlyRateCents ?? 0,
      currency: room.currency,
      description: room.rentalDescription,
      dimensions: room.dimensions,
      amenities: room.amenities,
      courseRoomIndex: room.courseRoomIndex,
    };
    if (room.floorId && floorBuckets.has(room.floorId)) {
      floorBuckets.get(room.floorId)!.rooms.push(publicRoom);
    } else {
      ungrouped.rooms.push(publicRoom);
    }
  }

  const floorList = [...floorBuckets.values()].filter((f) => f.rooms.length > 0);
  if (ungrouped.rooms.length) floorList.push(ungrouped);

  return {
    ok: true,
    locationId: location.id,
    settings: {
      openHour: settings.openHour,
      closeHour: settings.closeHour,
      bufferMinutes: settings.bufferMinutes,
      durationOptions: settings.durationOptions,
      minLeadHours: settings.minLeadHours,
      b2bRequiresApproval: settings.b2bRequiresApproval,
      moduleEnabled: settings.moduleEnabled,
    },
    floors: floorList,
  };
}

async function resolveRentableRoom(roomId: string) {
  const room = await prisma.station.findFirst({
    where: { id: roomId, kind: "ROOM", isActive: true, rentable: true },
    include: {
      location: { select: { id: true, timezone: true, isActive: true } },
    },
  });
  if (!room || !room.location.isActive) return null;
  return room;
}

export async function getPublicRoomAvailability(input: {
  roomId: string;
  date: string;
  durationMinutes?: number;
}): Promise<
  | {
      ok: true;
      date: string;
      sessionDay: string | null;
      slots: Array<{ start: string; end: string; priceCents: number }>;
      timeline: ReturnType<typeof buildRoomDayTimeline>;
      summary: ReturnType<typeof getDayAvailabilitySummary>;
    }
  | { ok: false; error: string; status: number }
> {
  if (!DATE_RE.test(input.date)) {
    return { ok: false, error: "invalid_date", status: 400 };
  }

  const room = await resolveRentableRoom(input.roomId);
  if (!room) return { ok: false, error: "room_not_found", status: 404 };

  const settings = await loadRentalSettings(room.locationId);
  if (!settings.moduleEnabled) {
    return { ok: false, error: "rental_module_disabled", status: 404 };
  }

  const durationMinutes = input.durationMinutes ?? 60;
  const [classes, bookings] = await Promise.all([
    loadPublishedClasses(room.locationId),
    loadBookingOccupancy(room.id, input.date, input.date),
  ]);

  const hourlyRateCents = room.hourlyRateCents ?? 0;
  const slots = getAvailableStartTimes({
    classes,
    bookings,
    roomId: room.id,
    dateIso: input.date,
    durationMinutes,
    openHour: settings.openHour,
    closeHour: settings.closeHour,
    bufferMinutes: settings.bufferMinutes,
  }).map((s) => ({
    ...s,
    priceCents: estimateRentalPriceCents(hourlyRateCents, durationMinutes),
  }));

  const timeline = buildRoomDayTimeline({
    classes,
    bookings,
    roomId: room.id,
    dateIso: input.date,
    openHour: settings.openHour,
    closeHour: settings.closeHour,
    bufferMinutes: settings.bufferMinutes,
  });

  const summary = getDayAvailabilitySummary({
    classes,
    bookings,
    roomId: room.id,
    dateIso: input.date,
    durationMinutes,
    openHour: settings.openHour,
    closeHour: settings.closeHour,
    bufferMinutes: settings.bufferMinutes,
    todayIso: todayIsoInTimeZone(room.location.timezone),
  });

  return {
    ok: true,
    date: input.date,
    sessionDay: timeline.sessionDay,
    slots,
    timeline,
    summary,
  };
}

export async function getPublicRoomMonthSummary(input: {
  roomId: string;
  year: number;
  month: number;
  durationMinutes?: number;
}): Promise<
  | { ok: true; summary: ReturnType<typeof getMonthAvailability> }
  | { ok: false; error: string; status: number }
> {
  if (!Number.isInteger(input.year) || input.month < 1 || input.month > 12) {
    return { ok: false, error: "invalid_query", status: 400 };
  }

  const room = await resolveRentableRoom(input.roomId);
  if (!room) return { ok: false, error: "room_not_found", status: 404 };

  const settings = await loadRentalSettings(room.locationId);
  if (!settings.moduleEnabled) {
    return { ok: false, error: "rental_module_disabled", status: 404 };
  }

  const monthIndex = input.month - 1;
  const fromDate = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const lastDay = new Date(input.year, input.month, 0).getDate();
  const toDate = `${input.year}-${String(input.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [classes, bookings] = await Promise.all([
    loadPublishedClasses(room.locationId),
    loadBookingOccupancy(room.id, fromDate, toDate),
  ]);

  const summary = getMonthAvailability({
    classes,
    bookings,
    roomId: room.id,
    year: input.year,
    month: monthIndex,
    durationMinutes: input.durationMinutes ?? 60,
    openHour: settings.openHour,
    closeHour: settings.closeHour,
    bufferMinutes: settings.bufferMinutes,
    todayIso: todayIsoInTimeZone(room.location.timezone),
  });

  return { ok: true, summary };
}

function resolveCreateStatuses(input: {
  type: "prive" | "b2b" | "staff";
  b2bRequiresApproval: boolean;
  paymentProvider?: "interac" | "paypal" | "cash";
}): {
  type: RentalBookingType;
  status: RentalBookingStatus;
  paymentStatus: RentalPaymentStatus;
  paymentProvider: RentalPaymentProvider | null;
} {
  if (input.type === "staff") {
    return {
      type: "STAFF",
      status: "CONFIRMED",
      paymentStatus: "WAIVED_STAFF",
      paymentProvider: null,
    };
  }
  if (input.type === "b2b" && input.b2bRequiresApproval) {
    return {
      type: "B2B",
      status: "PENDING",
      paymentStatus: "PENDING_APPROVAL",
      paymentProvider: input.paymentProvider
        ? (input.paymentProvider.toUpperCase() as RentalPaymentProvider)
        : null,
    };
  }
  if (input.type === "b2b") {
    return {
      type: "B2B",
      status: "CONFIRMED",
      paymentStatus:
        input.paymentProvider === "paypal"
          ? "PENDING_PAYPAL"
          : input.paymentProvider === "cash"
            ? "NONE"
            : "PENDING_INTERAC",
      paymentProvider: (input.paymentProvider?.toUpperCase() as RentalPaymentProvider) ?? "INTERAC",
    };
  }
  // prive — instant confirm
  const provider = input.paymentProvider ?? "interac";
  return {
    type: "PRIVE",
    status: "CONFIRMED",
    paymentStatus:
      provider === "paypal" ? "PENDING_PAYPAL" : provider === "cash" ? "NONE" : "PENDING_INTERAC",
    paymentProvider: provider.toUpperCase() as RentalPaymentProvider,
  };
}

export async function createPublicRentalBooking(
  input: PublicRentalBookingInput,
): Promise<
  | {
      ok: true;
      bookingId: string;
      status: string;
      paymentStatus: string;
      priceCents: number;
      interacInstructions?: string;
    }
  | { ok: false; error: string; status: number }
> {
  const room = await resolveRentableRoom(input.roomId);
  if (!room) return { ok: false, error: "room_not_found", status: 404 };

  if (input.locationId && input.locationId !== room.locationId) {
    return { ok: false, error: "location_mismatch", status: 400 };
  }
  if (input.locationSlug || input.organizationSlug) {
    const loc = await resolvePublicLocation({
      locationSlug: input.locationSlug,
      organizationSlug: input.organizationSlug,
      locationId: input.locationId,
    });
    if (!loc || loc.id !== room.locationId) {
      return { ok: false, error: "location_mismatch", status: 400 };
    }
  }

  const settings = await loadRentalSettings(room.locationId);
  if (!settings.moduleEnabled) {
    return { ok: false, error: "rental_module_disabled", status: 404 };
  }

  const startMin = Number(input.timeStart.split(":")[0]) * 60 + Number(input.timeStart.split(":")[1]);
  const endMin = Number(input.timeEnd.split(":")[0]) * 60 + Number(input.timeEnd.split(":")[1]);
  if (endMin <= startMin) return { ok: false, error: "invalid_time_range", status: 400 };

  if (
    violatesMinLead({
      dateIso: input.date,
      timeStart: input.timeStart,
      minLeadHours: settings.minLeadHours,
      timeZone: room.location.timezone,
    })
  ) {
    return { ok: false, error: "min_lead_hours", status: 409 };
  }

  const durationMinutes = endMin - startMin;
  const priceCents = estimateRentalPriceCents(room.hourlyRateCents ?? 0, durationMinutes);
  const statuses = resolveCreateStatuses({
    type: input.type,
    b2bRequiresApproval: settings.b2bRequiresApproval,
    paymentProvider: input.paymentProvider,
  });

  try {
    const booking = await prisma.$transaction(async (tx) => {
      const [classes, bookings] = await Promise.all([
        loadPublishedClasses(room.locationId),
        (async () => {
          const rows = await tx.rentalBooking.findMany({
            where: {
              roomId: room.id,
              date: civilDateToUtcDate(input.date),
              status: { not: "CANCELLED" },
            },
            select: {
              roomId: true,
              date: true,
              timeStart: true,
              timeEnd: true,
              type: true,
              status: true,
            },
          });
          return rows.map((r) => ({
            roomId: r.roomId,
            date: civilDateFromDbDate(r.date),
            timeStart: r.timeStart,
            timeEnd: r.timeEnd,
            type: r.type.toLowerCase() as "prive" | "b2b" | "staff",
            status: r.status.toLowerCase(),
          }));
        })(),
      ]);

      const slot = isSlotAvailable({
        classes,
        bookings,
        roomId: room.id,
        dateIso: input.date,
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
        bufferMinutes: settings.bufferMinutes,
      });
      if (!slot.ok) {
        throw Object.assign(new Error("slot_unavailable"), {
          code: "slot_unavailable",
          reason: slot.reason,
        });
      }

      const created = await tx.rentalBooking.create({
        data: {
          locationId: room.locationId,
          roomId: room.id,
          date: civilDateToUtcDate(input.date),
          timeStart: input.timeStart,
          timeEnd: input.timeEnd,
          type: statuses.type,
          status: statuses.status,
          paymentStatus: statuses.paymentStatus,
          paymentProvider: statuses.paymentProvider,
          priceCents,
          currency: room.currency || "CAD",
          clientName: input.client.name,
          clientEmail: input.client.email,
          clientPhone: input.client.phone ?? null,
          clientOrg: input.client.org ?? null,
          notes: input.notes ?? null,
          confirmedAt: statuses.status === "CONFIRMED" ? new Date() : null,
        },
      });
      return created;
    });

    if (booking.type === "B2B" && booking.status === "PENDING") {
      void sendRentalEmail({
        to: process.env.RENTAL_NOTIFY_EMAIL?.trim() || "",
        kind: "b2b_pending_staff",
        subject: `Demande B2B — ${booking.clientName}`,
        text: [
          `Nouvelle demande de location B2B.`,
          `Client: ${booking.clientName} <${booking.clientEmail}>`,
          booking.clientOrg ? `Organisation: ${booking.clientOrg}` : null,
          `Date: ${input.date} ${booking.timeStart}–${booking.timeEnd}`,
          `Salle: ${stationLabel(room, "fr")}`,
          `Montant: ${(priceCents / 100).toFixed(2)} ${booking.currency}`,
        ]
          .filter(Boolean)
          .join("\n"),
        meta: { bookingId: booking.id },
      });
    } else if (booking.status === "CONFIRMED") {
      void sendRentalEmail({
        to: booking.clientEmail,
        kind: "rental_confirmed",
        subject: `Confirmation — location ${stationLabel(room, "fr")}`,
        text: [
          `Votre réservation est confirmée.`,
          `Salle: ${stationLabel(room, "fr")}`,
          `Date: ${input.date} ${booking.timeStart}–${booking.timeEnd}`,
          `Montant: ${(priceCents / 100).toFixed(2)} ${booking.currency}`,
          booking.paymentStatus === "PENDING_INTERAC"
            ? "Paiement: Interac e-Transfer en attente de confirmation."
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
        meta: { bookingId: booking.id },
      });
    }

    return {
      ok: true,
      bookingId: booking.id,
      status: booking.status.toLowerCase(),
      paymentStatus: booking.paymentStatus.toLowerCase(),
      priceCents: booking.priceCents,
      ...(booking.paymentStatus === "PENDING_INTERAC"
        ? {
            interacInstructions:
              "Envoyez le virement Interac au montant indiqué. La réservation sera confirmée à la réception.",
          }
        : {}),
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "slot_unavailable"
    ) {
      return { ok: false, error: "slot_unavailable", status: 409 };
    }
    throw error;
  }
}

export async function getPublicRentalBooking(id: string): Promise<
  | {
      ok: true;
      booking: {
        id: string;
        status: string;
        paymentStatus: string;
        priceCents: number;
        currency: string;
        date: string;
        timeStart: string;
        timeEnd: string;
        type: string;
        roomId: string;
        roomName: string;
      };
    }
  | { ok: false; error: string; status: number }
> {
  const row = await prisma.rentalBooking.findUnique({
    where: { id },
    include: { room: true },
  });
  if (!row) return { ok: false, error: "booking_not_found", status: 404 };

  return {
    ok: true,
    booking: {
      id: row.id,
      status: row.status.toLowerCase(),
      paymentStatus: row.paymentStatus.toLowerCase(),
      priceCents: row.priceCents,
      currency: row.currency,
      date: civilDateFromDbDate(row.date),
      timeStart: row.timeStart,
      timeEnd: row.timeEnd,
      type: row.type.toLowerCase(),
      roomId: row.roomId,
      roomName: stationLabel(row.room, "fr"),
    },
  };
}
