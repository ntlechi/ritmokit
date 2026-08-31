"use server";

import { canAccessAccueil, getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { getInscriptionAdvice } from "@/lib/public-api/inscription-advice";
import type { AdvisorResult } from "@/lib/dance/inscription-advisor";

export type AdviseInscriptionResult =
  | { ok: true; locationName: string; advice: AdvisorResult }
  | { ok: false; error: string };

export async function adviseInscriptionAction(input: {
  locationId: string;
  role: "LEAD" | "FOLLOW";
  style?: string;
  dayOfWeek?: number | null;
  withPartner?: boolean;
}): Promise<AdviseInscriptionResult> {
  const user = await getSessionUser();
  if (!user || !canAccessAccueil(user.role)) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await getPrimaryMembership(user.id);
  if (!membership || membership.locationId !== input.locationId) {
    return { ok: false, error: "unauthorized" };
  }

  const result = await getInscriptionAdvice({
    locationId: input.locationId,
    role: input.role,
    style: input.style?.trim() || null,
    dayOfWeek: input.dayOfWeek ?? null,
    withPartner: Boolean(input.withPartner),
  });
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, locationName: result.locationName, advice: result.advice };
}
