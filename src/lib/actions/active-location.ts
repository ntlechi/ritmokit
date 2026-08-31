"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { canAccessLocation, ACTIVE_LOCATION_COOKIE } from "@/lib/locations/active-location";
import { getSessionUser } from "@/lib/auth/session";

export type SetActiveLocationResult = { ok: true } | { ok: false; error: string };

export async function setActiveLocationAction(
  locationId: string,
): Promise<SetActiveLocationResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId)) {
    return { ok: false, error: "invalid_location" };
  }

  const allowed = await canAccessLocation(user.id, user.role, locationId);
  if (!allowed) return { ok: false, error: "unauthorized" };

  const store = await cookies();
  store.set(ACTIVE_LOCATION_COOKIE, locationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
