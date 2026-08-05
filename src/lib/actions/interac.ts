"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { canAccessManagerSettings } from "@/lib/auth/session-client";
import { actionDatabaseError } from "@/lib/actions/result";
import {
  cancelInteracEnrollment,
  confirmInteracEnrollment,
  interacSettingsPatchSchema,
  patchInteracSettings,
} from "@/lib/payments/interac";

export async function confirmInteracAction(
  enrollmentId: string,
  opts?: { note?: string; sendConfirmationEmail?: boolean },
) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  try {
    const result = await confirmInteracEnrollment({
      userId: user.id,
      role: user.role,
      enrollmentId,
      note: opts?.note,
      sendConfirmationEmail: opts?.sendConfirmationEmail,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/[lang]/interac", "page");
    revalidatePath("/[lang]/accueil", "page");
    return { ok: true as const, alreadyProcessed: result.alreadyProcessed };
  } catch (error) {
    return actionDatabaseError("interac.confirm", error);
  }
}

export async function cancelInteracAction(enrollmentId: string, reason?: string) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  try {
    const result = await cancelInteracEnrollment({
      userId: user.id,
      role: user.role,
      enrollmentId,
      reason,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/[lang]/interac", "page");
    revalidatePath("/[lang]/accueil", "page");
    return { ok: true as const, promoted: result.promoted };
  } catch (error) {
    return actionDatabaseError("interac.cancel", error);
  }
}

export async function saveInteracSettingsAction(raw: unknown) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  const parsed = interacSettingsPatchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "invalid_payload" };
  try {
    const result = await patchInteracSettings({
      userId: user.id,
      role: user.role,
      payload: parsed.data,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/[lang]/interac", "page");
    return { ok: true as const };
  } catch (error) {
    return actionDatabaseError("interac.settings", error);
  }
}
