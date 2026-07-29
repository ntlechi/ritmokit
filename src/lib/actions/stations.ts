"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import type { StationKindValue } from "@/lib/stations/dance-defaults";

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
  if (lang) {
    revalidatePath(`/${lang}/settings/manager/stations`, "page");
    revalidatePath(`/${lang}/rooms`, "page");
  }
  revalidatePath("/[lang]/settings/manager/stations", "page");
  revalidatePath("/[lang]/rooms", "page");
  revalidatePath("/[lang]/team", "page");
  revalidatePath("/[lang]/calendar", "layout");
}

function parseOptionalPositiveInt(value: number | null | undefined): number | null | { error: string } {
  if (value == null || Number.isNaN(value)) return null;
  if (!Number.isInteger(value) || value < 1 || value > 500) return { error: "invalid_capacity" };
  return value;
}

function parseOptionalSurface(value: number | null | undefined): number | null | { error: string } {
  if (value == null || Number.isNaN(value)) return null;
  if (value <= 0 || value > 10_000) return { error: "invalid_surface" };
  return Math.round(value * 100) / 100;
}

export async function createStationAction(input: {
  lang: string;
  locationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  slug?: string;
  capacity?: number | null;
  surfaceSqm?: number | null;
  kind?: StationKindValue;
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

    const capacity = parseOptionalPositiveInt(input.capacity ?? null);
    if (capacity && typeof capacity === "object") return { ok: false, error: capacity.error };
    const surfaceSqm = parseOptionalSurface(input.surfaceSqm ?? null);
    if (surfaceSqm && typeof surfaceSqm === "object") return { ok: false, error: surfaceSqm.error };

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
        kind: input.kind ?? "ROOM",
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        capacity: capacity as number | null,
        surfaceSqm: surfaceSqm as number | null,
      },
    });

    revalidateStations(input.lang);
    revalidatePath(`/${input.lang}/rooms`, "page");
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
  capacity?: number | null;
  surfaceSqm?: number | null;
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

    const capacity = parseOptionalPositiveInt(input.capacity ?? null);
    if (capacity && typeof capacity === "object") return { ok: false, error: capacity.error };
    const surfaceSqm = parseOptionalSurface(input.surfaceSqm ?? null);
    if (surfaceSqm && typeof surfaceSqm === "object") return { ok: false, error: surfaceSqm.error };

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
        capacity: capacity as number | null,
        surfaceSqm: surfaceSqm as number | null,
      },
    });

    revalidateStations(input.lang);
    revalidatePath(`/${input.lang}/rooms`, "page");
    return { ok: true, stationId: input.stationId };
  } catch (error) {
    return actionDatabaseError("stations", error);
  }
}
