"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type StationActionResult =
  | { ok: true; stationId: string }
  | { ok: false; error: string };

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

async function assertManagerForLocation(locationId: string) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  const membership = await prisma.locationMember.findUnique({
    where: { locationId_userId: { locationId, userId: user.id } },
  });
  if (!membership && user.role !== "ADMIN") {
    return { ok: false as const, error: "unauthorized" };
  }
  return { ok: true as const, userId: user.id };
}

function revalidateStations(lang?: string) {
  if (lang) revalidatePath(`/${lang}/settings/manager/stations`, "page");
  revalidatePath("/[lang]/settings/manager/stations", "page");
  revalidatePath("/[lang]/team", "page");
  revalidatePath("/[lang]/calendar", "layout");
}

export async function createStationAction(input: {
  lang: string;
  locationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  slug?: string;
}): Promise<StationActionResult> {
  try {
    const auth = await assertManagerForLocation(input.locationId);
    if (!auth.ok) return auth;

    const nameFr = input.nameFr.trim();
    const nameEn = input.nameEn.trim();
    const nameEs = input.nameEs.trim();
    const colorHex = input.colorHex.trim();
    const slug = input.slug?.trim().toLowerCase() || null;

    if (!nameFr || !nameEn || !nameEs) return { ok: false, error: "missing_names" };
    if (!HEX_PATTERN.test(colorHex)) return { ok: false, error: "invalid_color" };

    const maxOrder = await prisma.station.aggregate({
      where: { locationId: input.locationId },
      _max: { sortOrder: true },
    });

    const station = await prisma.station.create({
      data: {
        locationId: input.locationId,
        nameFr,
        nameEn,
        nameEs,
        colorHex,
        slug,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    revalidateStations(input.lang);
    return { ok: true, stationId: station.id };
  } catch (error) {
    return actionDatabaseError("stations", error);
  }
}

export async function updateStationAction(input: {
  lang: string;
  locationId: string;
  stationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  slug?: string;
  isActive: boolean;
  tipPoints: number;
}): Promise<StationActionResult> {
  try {
    const auth = await assertManagerForLocation(input.locationId);
    if (!auth.ok) return auth;

    const nameFr = input.nameFr.trim();
    const nameEn = input.nameEn.trim();
    const nameEs = input.nameEs.trim();
    const colorHex = input.colorHex.trim();
    const slug = input.slug?.trim().toLowerCase() || null;

    if (!nameFr || !nameEn || !nameEs) return { ok: false, error: "missing_names" };
    if (!HEX_PATTERN.test(colorHex)) return { ok: false, error: "invalid_color" };
    if (input.tipPoints <= 0 || input.tipPoints > 5) return { ok: false, error: "invalid_tip_points" };

    const existing = await prisma.station.findFirst({
      where: { id: input.stationId, locationId: input.locationId },
    });
    if (!existing) return { ok: false, error: "not_found" };

    await prisma.station.update({
      where: { id: input.stationId },
      data: {
        nameFr,
        nameEn,
        nameEs,
        colorHex,
        slug,
        isActive: input.isActive,
        tipPoints: input.tipPoints,
      },
    });

    revalidateStations(input.lang);
    return { ok: true, stationId: input.stationId };
  } catch (error) {
    return actionDatabaseError("stations", error);
  }
}
