import "server-only";

import { prisma } from "@/lib/prisma";
import { DEFAULT_RENTAL_SETTINGS } from "@/lib/rentals/defaults";
import { loadRoomRentalsForClassCheck } from "@/lib/rentals/occupancy";
import { findRentalConflictsForClass, todayIsoInTimeZone } from "@/lib/rentals/schedule";
import { civilDateFromDbDate, hhmmFromUtcDate } from "@/lib/rentals/wall-time";
import { stationLabel } from "@/lib/stations/display";

export type ClassRentalConflict = {
  room: string;
  client: string;
  date: string;
  start: string;
  end: string;
  /** Further colliding rental dates beyond the first one. */
  more: number;
};

/**
 * Rentals a class would land on in `roomId`, from today (location time) to the
 * end of its season. Class times use the UTC wall-clock storage of ClassSession.
 */
export async function findClassRentalConflict(input: {
  roomId: string;
  seasonId?: string | null;
  dayOfWeek: number | null;
  startTime: Date;
  endTime: Date;
  locale?: string;
}): Promise<ClassRentalConflict | null> {
  const [room, season] = await Promise.all([
    prisma.station.findUnique({
      where: { id: input.roomId },
      select: {
        nameFr: true,
        nameEn: true,
        nameEs: true,
        location: { select: { id: true, timezone: true } },
      },
    }),
    input.seasonId
      ? prisma.sessionSeason.findUnique({
          where: { id: input.seasonId },
          select: { startsOn: true, endsOn: true },
        })
      : null,
  ]);
  if (!room) return null;

  const todayIso = todayIsoInTimeZone(room.location.timezone);
  const oneOffDate = input.dayOfWeek == null ? civilDateFromDbDate(input.startTime) : null;
  const seasonFrom = season ? civilDateFromDbDate(season.startsOn) : todayIso;
  const validFrom = oneOffDate ?? (seasonFrom > todayIso ? seasonFrom : todayIso);
  const validTo = oneOffDate ?? (season ? civilDateFromDbDate(season.endsOn) : null);
  if (validTo && validTo < validFrom) return null;

  const [rentals, settings] = await Promise.all([
    loadRoomRentalsForClassCheck(input.roomId, validFrom, validTo),
    prisma.locationRentalSettings.findUnique({
      where: { locationId: room.location.id },
      select: { bufferMinutes: true },
    }),
  ]);
  if (rentals.length === 0) return null;

  const conflicts = findRentalConflictsForClass({
    rentals,
    dayOfWeek: input.dayOfWeek,
    dateIso: oneOffDate,
    timeStart: hhmmFromUtcDate(input.startTime),
    timeEnd: hhmmFromUtcDate(input.endTime),
    validFrom,
    validTo,
    bufferMinutes: settings?.bufferMinutes ?? DEFAULT_RENTAL_SETTINGS.bufferMinutes,
  });
  const first = conflicts[0];
  if (!first) return null;

  return {
    room: stationLabel(
      room,
      input.locale === "en" || input.locale === "es" ? input.locale : "fr",
    ),
    client: first.clientName,
    date: first.date,
    start: first.timeStart,
    end: first.timeEnd,
    more: conflicts.length - 1,
  };
}
