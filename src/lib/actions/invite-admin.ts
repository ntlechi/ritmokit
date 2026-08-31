"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessibleLocations } from "@/lib/locations/active-location";
import { seatBrandLeaderOnOrganization } from "@/lib/locations/seat-brand";
import {
  confirmAuthEmail,
  findAuthUserIdByEmail,
  inviteEmployeeByEmail,
} from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n/config";

export type InviteAdminResult =
  | { ok: true; invited: boolean }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function resolveOrigin(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

/**
 * Invite an ADMIN onto the caller's brand. They join every school in that brand.
 */
export async function inviteBrandAdminAction(input: {
  lang: string;
  email: string;
  fullName: string;
}): Promise<InviteAdminResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || (sessionUser.role !== "ADMIN" && sessionUser.role !== "OWNER")) {
      return { ok: false, error: "unauthorized" };
    }

    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (!EMAIL_RE.test(email) || !fullName) {
      return { ok: false, error: "missing_fields" };
    }
    if (email === sessionUser.email.toLowerCase()) {
      return { ok: false, error: "cannot_modify_self" };
    }

    const accessible = await getAccessibleLocations(sessionUser.id, sessionUser.role);
    const organizationId = accessible[0]?.organizationId;
    if (!organizationId) return { ok: false, error: "unauthorized" };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== "ADMIN" && existing.role !== "OWNER") {
        await prisma.user.update({
          where: { id: existing.id },
          data: { role: "ADMIN", fullName: existing.fullName || fullName },
        });
      }
      await confirmAuthEmail(existing.id);
      await seatBrandLeaderOnOrganization(existing.id, organizationId);
      revalidateInvite(input.lang);
      return { ok: true, invited: false };
    }

    const lang: Locale = isLocale(input.lang) ? input.lang : defaultLocale;
    const origin = await resolveOrigin();
    const redirectTo = new URL(`/${lang}/auth/callback`, origin).toString();

    const invite = await inviteEmployeeByEmail({ email, fullName, redirectTo });
    if (!invite.ok) return { ok: false, error: "invite_failed" };

    let userId = invite.userId;
    if (invite.alreadyInvited || !userId) {
      userId = await findAuthUserIdByEmail(email);
    }
    if (!userId) return { ok: false, error: "auth_email_conflict" };

    await prisma.user.upsert({
      where: { id: userId },
      update: { email, fullName, role: "ADMIN" },
      create: { id: userId, email, fullName, role: "ADMIN" },
    });
    await confirmAuthEmail(userId);
    await seatBrandLeaderOnOrganization(userId, organizationId);

    revalidateInvite(input.lang);
    return { ok: true, invited: !invite.alreadyInvited };
  } catch (error) {
    return actionDatabaseError("invite-admin", error);
  }
}

function revalidateInvite(lang?: string) {
  if (lang) {
    revalidatePath(`/${lang}/settings/admin`, "page");
    revalidatePath(`/${lang}/team`, "page");
  }
  revalidatePath("/[lang]/settings/admin", "page");
  revalidatePath("/[lang]/team", "page");
}
