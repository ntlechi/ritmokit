import "server-only";

import { evaluateBreakCompliance, recordBreakComplianceViolation } from "@/lib/agents/handlers/break-compliance";
import { haversineDistanceMeters } from "@/lib/geo";
import { isOnboardingComplete } from "@/lib/hr/onboarding";
import { prisma } from "@/lib/prisma";
import { isTrainingCompliantForShift } from "@/lib/training/compliance";

export type PunchCoreResult =
  | { ok: true }
  | { ok: false; error: string; distanceMeters?: number };

export type PunchCoords = { lat: number; lng: number };

/** How physical presence was established for this clock-in. */
export type PunchPresence =
  | { kind: "geofence"; coords: PunchCoords }
  | { kind: "kiosk"; locationId: string };

/** Ignore a second punch for the same user within this window (kiosk double-tap). */
export const PUNCH_IDEMPOTENCY_WINDOW_MS = 30_000;

async function loadOwnedShift(shiftId: string, userId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      location: { select: { latitude: true, longitude: true, geofenceRadiusMeters: true } },
    },
  });

  if (!shift) return { ok: false as const, error: "shift_not_found" as const };
  if (shift.employeeId !== userId) return { ok: false as const, error: "unauthorized" as const };
  return { ok: true as const, shift };
}

/** True if this user had a successful punch (in or out) within the idempotency window. */
async function hasRecentPunchEvent(userId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - PUNCH_IDEMPOTENCY_WINDOW_MS);
  const recent = await prisma.shift.findFirst({
    where: {
      employeeId: userId,
      OR: [{ actualStartsAt: { gte: since } }, { actualEndsAt: { gte: since } }],
    },
    select: { id: true },
  });
  return Boolean(recent);
}

function assertGeofence(
  shift: {
    location: {
      latitude: number | null;
      longitude: number | null;
      geofenceRadiusMeters: number;
    };
  },
  coords: PunchCoords,
): PunchCoreResult | null {
  const loc = shift.location;
  if (loc.latitude == null || loc.longitude == null || loc.geofenceRadiusMeters <= 0) {
    return null;
  }
  if (
    !Number.isFinite(coords.lat) ||
    !Number.isFinite(coords.lng) ||
    Math.abs(coords.lat) > 90 ||
    Math.abs(coords.lng) > 180
  ) {
    return { ok: false, error: "coords_required" };
  }
  const distanceMeters = haversineDistanceMeters(
    coords.lat,
    coords.lng,
    loc.latitude,
    loc.longitude,
  );
  if (distanceMeters > loc.geofenceRadiusMeters) {
    return {
      ok: false,
      error: "outside_geofence",
      distanceMeters: Math.round(distanceMeters),
    };
  }
  return null;
}

export async function clockInForUser(
  userId: string,
  shiftId: string,
  role: string,
  presence?: PunchPresence | PunchCoords,
): Promise<PunchCoreResult> {
  const result = await loadOwnedShift(shiftId, userId);
  if (!result.ok) return { ok: false, error: result.error };
  const { shift } = result;

  if (shift.status === "DRAFT" || shift.status === "REJECTED") {
    return { ok: false, error: "invalid_shift_status" };
  }
  if (shift.actualStartsAt) return { ok: false, error: "already_clocked_in" };

  if (role === "EMPLOYEE") {
    const onboardingComplete = await isOnboardingComplete(userId);
    if (!onboardingComplete) return { ok: false, error: "onboarding_incomplete" };

    const training = await isTrainingCompliantForShift(userId, shift.stationId, shift.locationId);
    if (!training.compliant) return { ok: false, error: "training_incomplete" };
  }

  // Normalize legacy `{ lat, lng }` callers into an explicit presence mode.
  const normalized: PunchPresence | undefined =
    presence && "lat" in presence
      ? { kind: "geofence", coords: presence }
      : presence;

  const geofenceConfigured =
    shift.location.latitude != null &&
    shift.location.longitude != null &&
    shift.location.geofenceRadiusMeters > 0;

  if (normalized?.kind === "kiosk") {
    if (normalized.locationId !== shift.locationId) {
      return { ok: false, error: "unauthorized" };
    }
    // Manager tablet at the location attests presence — GPS optional.
  } else if (geofenceConfigured) {
    if (!normalized || normalized.kind !== "geofence") {
      return { ok: false, error: "coords_required" };
    }
    const geoError = assertGeofence(shift, normalized.coords);
    if (geoError) return geoError;
  } else if (normalized?.kind === "geofence") {
    const geoError = assertGeofence(shift, normalized.coords);
    if (geoError) return geoError;
  }

  const now = new Date();
  if (await hasRecentPunchEvent(userId, now)) {
    return { ok: false, error: "punch_too_soon" };
  }

  // Conditional write — loses the race cleanly if another request already set actualStartsAt.
  const updated = await prisma.shift.updateMany({
    where: {
      id: shiftId,
      employeeId: userId,
      actualStartsAt: null,
    },
    data: { actualStartsAt: now },
  });

  if (updated.count === 0) {
    return { ok: false, error: "race_lost" };
  }

  return { ok: true };
}

/**
 * Clock-out + évaluation pause CNESST (non bloquante).
 * Partagé par Server Action pointeuse et harness k6 `/api/load/punch-out`.
 */
export async function clockOutForUser(userId: string, shiftId: string): Promise<PunchCoreResult> {
  const result = await loadOwnedShift(shiftId, userId);
  if (!result.ok) return { ok: false, error: result.error };
  const { shift } = result;

  if (!shift.actualStartsAt) return { ok: false, error: "not_clocked_in" };
  if (shift.actualEndsAt) return { ok: false, error: "already_clocked_out" };

  const now = new Date();
  if (await hasRecentPunchEvent(userId, now)) {
    return { ok: false, error: "punch_too_soon" };
  }

  const hasOpenBreak = Boolean(shift.breakStartedAt && !shift.breakEndedAt);
  const finalBreakEndedAt = hasOpenBreak ? now : shift.breakEndedAt;

  // Conditional write — only an actively open shift can be closed.
  const updated = await prisma.shift.updateMany({
    where: {
      id: shiftId,
      employeeId: userId,
      actualStartsAt: { not: null },
      actualEndsAt: null,
    },
    data: {
      actualEndsAt: now,
      ...(hasOpenBreak ? { breakEndedAt: now } : {}),
    },
  });

  if (updated.count === 0) {
    return { ok: false, error: "race_lost" };
  }

  const assessment = evaluateBreakCompliance({
    breakRequiredMinutes: shift.breakRequiredMinutes,
    breakStartedAt: shift.breakStartedAt,
    breakEndedAt: finalBreakEndedAt,
  });
  if (assessment.violation) {
    await recordBreakComplianceViolation({ shift, assessment }).catch((error) => {
      console.error("[mirok:break-compliance]", error);
    });
  }

  return { ok: true };
}
