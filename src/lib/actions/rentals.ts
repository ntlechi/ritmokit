"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { canAccessManagerSettings } from "@/lib/auth/session-client";
import { actionDatabaseError } from "@/lib/actions/result";
import {
  approveRentalBooking,
  createStaffRentalBooking,
  patchRentalSettings,
  rejectRentalBooking,
  rentalSettingsPatchSchema,
  staffRentalBookingSchema,
} from "@/lib/rentals/studio";

export async function approveRentalBookingAction(bookingId: string) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  try {
    const result = await approveRentalBooking({
      userId: user.id,
      role: user.role,
      bookingId,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/[lang]/rentals", "page");
    return { ok: true as const };
  } catch (error) {
    return actionDatabaseError("rentals.approve", error);
  }
}

export async function rejectRentalBookingAction(bookingId: string, reason?: string) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  try {
    const result = await rejectRentalBooking({
      userId: user.id,
      role: user.role,
      bookingId,
      reason,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/[lang]/rentals", "page");
    return { ok: true as const };
  } catch (error) {
    return actionDatabaseError("rentals.reject", error);
  }
}

export async function createStaffRentalBookingAction(raw: unknown) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  const parsed = staffRentalBookingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "invalid_payload" };
  try {
    const result = await createStaffRentalBooking({
      userId: user.id,
      role: user.role,
      payload: parsed.data,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/[lang]/rentals", "page");
    return { ok: true as const, bookingId: result.booking.id };
  } catch (error) {
    return actionDatabaseError("rentals.staffCreate", error);
  }
}

export async function saveRentalSettingsAction(raw: unknown) {
  const user = await getSessionUser();
  if (!user || !canAccessManagerSettings(user.role)) {
    return { ok: false as const, error: "unauthorized" };
  }
  const parsed = rentalSettingsPatchSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "invalid_payload" };
  try {
    const result = await patchRentalSettings({
      userId: user.id,
      role: user.role,
      payload: parsed.data,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    revalidatePath("/[lang]/rentals", "page");
    return { ok: true as const };
  } catch (error) {
    return actionDatabaseError("rentals.settings", error);
  }
}
