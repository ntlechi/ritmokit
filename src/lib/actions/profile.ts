"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { isValidAvatarDataUrl } from "@/lib/profile/avatar";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

function revalidateProfilePaths() {
  revalidatePath("/[lang]/settings", "page");
  revalidatePath("/[lang]/settings/profile", "page");
  revalidatePath("/[lang]/team", "page");
  revalidatePath("/[lang]/calendar", "layout");
  revalidatePath("/[lang]/calendar/mobile", "page");
  revalidatePath("/[lang]/calendar/week", "page");
  revalidatePath("/[lang]/calendar/manager/schedule", "page");
  revalidatePath("/[lang]/messages", "layout");
}

export async function updateProfilePictureAction(
  base64Image: string,
): Promise<ProfileActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };

    if (!isValidAvatarDataUrl(base64Image)) {
      return { ok: false, error: "invalid_image" };
    }

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { profilePictureUrl: base64Image },
    });

    revalidateProfilePaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("profile", error);
  }
}

export async function removeProfilePictureAction(): Promise<ProfileActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { profilePictureUrl: null },
    });

    revalidateProfilePaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("profile", error);
  }
}
