"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getPunchStatusForUser } from "@/lib/data/punch";
import { clockInForUser, clockOutForUser } from "@/lib/punch/core";
import {
  createPunchPinCredentials,
  isValidPunchPin,
  isWeakPunchPin,
  verifyPunchPin,
} from "@/lib/punch/pin";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export type PinPunchResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const FAIL_WINDOW_MS = 60_000;
const FAIL_LIMIT = 8;

/** Prefer platform-owned IP; never trust the first client-supplied XFF hop alone. */
function clientFingerprintFromHeaders(hdrs: Headers): string {
  const vercel = hdrs.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;

  const realIp = hdrs.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = hdrs.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Last hop is closest to our edge when the platform appends the connecting IP.
    return hops[hops.length - 1] ?? "unknown";
  }

  return "unknown";
}

async function countRecentFailures(
  locationId: string,
  clientFingerprint: string,
): Promise<number> {
  const since = new Date(Date.now() - FAIL_WINDOW_MS);
  return prisma.punchAttempt.count({
    where: {
      locationId,
      clientFingerprint,
      success: false,
      createdAt: { gte: since },
    },
  });
}

async function recordPunchAttempt(input: {
  locationId: string;
  clientFingerprint: string;
  success: boolean;
  matchedUserId?: string;
}): Promise<void> {
  await prisma.punchAttempt.create({
    data: {
      locationId: input.locationId,
      clientFingerprint: input.clientFingerprint,
      success: input.success,
      matchedUserId: input.matchedUserId,
    },
  });
}

type PinRosterRow = {
  userId: string;
  punchPinHash: string | null;
  punchPinSalt: string | null;
  user: { fullName: string; role: Role };
};

async function loadLocationPinRoster(
  locationId: string,
  excludeUserId?: string,
): Promise<PinRosterRow[]> {
  return prisma.employeeHrProfile.findMany({
    where: {
      punchPinHash: { not: null },
      punchPinSalt: { not: null },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      user: {
        role: "EMPLOYEE",
        locationMembers: { some: { locationId } },
      },
    },
    select: {
      userId: true,
      punchPinHash: true,
      punchPinSalt: true,
      user: { select: { fullName: true, role: true } },
    },
  });
}

function findPinMatches(pin: string, candidates: PinRosterRow[]): PinRosterRow[] {
  return candidates.filter((row) =>
    verifyPunchPin(pin, row.punchPinSalt, row.punchPinHash),
  );
}

export type PinPunchIntent = "IN" | "OUT";

const PUNCH_ERROR_MESSAGES: Record<string, string> = {
  onboarding_incomplete: "Intégration incomplète",
  training_incomplete: "Formation station incomplète",
  already_clocked_in: "Déjà pointé",
  already_clocked_out: "Déjà sorti",
  not_clocked_in: "Pas encore pointé",
  outside_geofence: "Hors zone (géofence)",
  coords_required: "Localisation requise pour pointer",
  punch_too_soon: "Attends quelques secondes avant de re-pointer",
  race_lost: "Pointage déjà enregistré",
};

export async function submitPinPunchAction(input: {
  locationId: string;
  pin: string;
  /** Explicit intent — duplicate IN/OUT is a no-op, never a toggle reversal. */
  intent: PinPunchIntent;
}): Promise<PinPunchResult> {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false, message: "Accès réservé à la tablette gérant" };
  }

  if (input.intent !== "IN" && input.intent !== "OUT") {
    return { ok: false, message: "Intention de pointage invalide" };
  }

  const pin = input.pin.trim();
  if (!isValidPunchPin(pin)) {
    return { ok: false, message: "NIP invalide — 4 chiffres requis" };
  }

  const hdrs = await headers();
  const clientFingerprint = clientFingerprintFromHeaders(hdrs);

  const failCount = await countRecentFailures(input.locationId, clientFingerprint);
  if (failCount >= FAIL_LIMIT) {
    return { ok: false, message: "Trop de tentatives — réessaie dans une minute" };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId: user.id, locationId: input.locationId },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, message: "Succursale non autorisée" };
  }

  const candidates = await loadLocationPinRoster(input.locationId);
  const matches = findPinMatches(pin, candidates);

  // Exactly one match required — zero or many → standardized auth failure.
  if (matches.length !== 1) {
    await recordPunchAttempt({
      locationId: input.locationId,
      clientFingerprint,
      success: false,
    });
    return { ok: false, message: "NIP invalide — réessaie" };
  }

  const profile = matches[0]!;
  await recordPunchAttempt({
    locationId: input.locationId,
    clientFingerprint,
    success: true,
    matchedUserId: profile.userId,
  });

  const status = await getPunchStatusForUser(profile.userId);
  const name = profile.user.fullName;
  const isOpen = status.state === "clocked_in" || status.state === "on_break";

  if (input.intent === "OUT") {
    if (!isOpen) {
      // Explicit OUT while not clocked in — no-op (never toggles into an IN).
      return { ok: true, message: `Déjà sorti — ${name}` };
    }
    if (!status.shift) {
      return { ok: false, message: `Quart introuvable pour ${name}` };
    }
    const result = await clockOutForUser(profile.userId, status.shift.id);
    if (!result.ok) {
      if (result.error === "race_lost" || result.error === "already_clocked_out") {
        return { ok: true, message: `Sortie déjà enregistrée — ${name}` };
      }
      return {
        ok: false,
        message:
          PUNCH_ERROR_MESSAGES[result.error] ??
          `Impossible de pointer la sortie (${result.error})`,
      };
    }
    revalidatePath("/[lang]/tablet", "page");
    revalidatePath("/[lang]/pointeuse", "page");
    return { ok: true, message: `Sortie enregistrée — ${name}` };
  }

  // intent === "IN"
  if (isOpen) {
    // Explicit IN while already clocked in — no-op (never toggles into an OUT).
    return { ok: true, message: `Déjà pointé — ${name}` };
  }

  if (!status.shift) {
    return { ok: false, message: `Aucun quart ouvert pour ${name}` };
  }

  const result = await clockInForUser(profile.userId, status.shift.id, profile.user.role, {
    kind: "kiosk",
    locationId: input.locationId,
  });
  if (!result.ok) {
    if (result.error === "race_lost" || result.error === "already_clocked_in") {
      return { ok: true, message: `Entrée déjà enregistrée — ${name}` };
    }
    return {
      ok: false,
      message: PUNCH_ERROR_MESSAGES[result.error] ?? `Impossible de pointer (${result.error})`,
    };
  }

  revalidatePath("/[lang]/tablet", "page");
  revalidatePath("/[lang]/pointeuse", "page");
  return { ok: true, message: `Entrée enregistrée — ${name}` };
}

export async function savePunchPinAction(
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "EMPLOYEE") return { ok: false, error: "unauthorized" };

  const trimmed = pin.trim();
  if (!isValidPunchPin(trimmed)) return { ok: false, error: "invalid_pin" };
  if (isWeakPunchPin(trimmed)) return { ok: false, error: "weak_pin" };

  const membership = await prisma.locationMember.findFirst({
    where: { userId: user.id, isPrimary: true },
    select: { locationId: true },
  });
  if (!membership) return { ok: false, error: "no_location" };

  // Uniqueness: hash candidate PIN against each peer's salt at this location.
  const peers = await loadLocationPinRoster(membership.locationId, user.id);
  const taken = peers.some((peer) =>
    verifyPunchPin(trimmed, peer.punchPinSalt, peer.punchPinHash),
  );
  if (taken) return { ok: false, error: "pin_taken" };

  const { salt, hash } = createPunchPinCredentials(trimmed);
  await prisma.employeeHrProfile.upsert({
    where: { userId: user.id },
    update: {
      punchPinHash: hash,
      punchPinSalt: salt,
      onboardingStatus: "IN_PROGRESS",
    },
    create: {
      userId: user.id,
      punchPinHash: hash,
      punchPinSalt: salt,
      onboardingStatus: "IN_PROGRESS",
    },
  });

  const { refreshOnboardingStatus } = await import("@/lib/hr/onboarding");
  await refreshOnboardingStatus(user.id);
  revalidatePath("/[lang]/onboarding", "page");
  return { ok: true };
}
