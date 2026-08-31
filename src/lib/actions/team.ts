"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Role } from "@/generated/prisma/enums";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { bootstrapRecruitIntegrationAction } from "@/lib/actions/hr-excellence";
import { ensurePrimaryStationSkill } from "@/lib/actions/skills";
import { canAccessLocation } from "@/lib/locations/active-location";
import { seatBrandLeaderOnOrganization } from "@/lib/locations/seat-brand";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import {
  confirmAuthEmail,
  findAuthUserIdByEmail,
  inviteEmployeeByEmail,
} from "@/lib/supabase/admin";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n/config";

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const OWNER_ROLES: Role[] = ["OWNER", "ADMIN"];
const FLOOR_ROLES: Role[] = ["EMPLOYEE", "MANAGER", "OWNER", "INSTRUCTOR", "FRONT_DESK"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim() || email;
}

async function assertLocationManager(locationId: string): Promise<
  | { ok: true; userId: string; role: Role }
  | { ok: false; error: string }
> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { ok: false, error: "unauthorized" };
  if (!canAccessManagerSettings(sessionUser.role)) {
    return { ok: false, error: "unauthorized" };
  }

  const allowed = await canAccessLocation(sessionUser.id, sessionUser.role, locationId);
  if (!allowed && sessionUser.role !== "ADMIN") {
    return { ok: false, error: "unauthorized" };
  }

  return { ok: true, userId: sessionUser.id, role: sessionUser.role };
}

async function assertLocationOwner(locationId: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { ok: false, error: "unauthorized" };
  if (!OWNER_ROLES.includes(sessionUser.role)) {
    return { ok: false, error: "unauthorized_only_owner" };
  }

  const allowed = await canAccessLocation(sessionUser.id, sessionUser.role, locationId);
  if (!allowed && sessionUser.role !== "ADMIN") {
    return { ok: false, error: "unauthorized" };
  }

  return { ok: true, userId: sessionUser.id };
}

function revalidateTeam(lang?: string) {
  if (lang) revalidatePath(`/${lang}/team`, "page");
  revalidatePath("/[lang]/team", "page");
}

async function resolveOrigin(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const protocol = hdrs.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

async function ensureTeamUser(input: {
  email: string;
  fullName: string;
  lang: string;
  role?: Role;
}): Promise<
  | { ok: true; userId: string; role: Role; invited: boolean }
  | { ok: false; error: string }
> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    await confirmAuthEmail(existing.id);
    let role = existing.role;
    if (
      input.role &&
      FLOOR_ROLES.includes(input.role) &&
      existing.role !== "ADMIN" &&
      input.role !== existing.role
    ) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: input.role },
      });
      role = input.role;
    }
    return { ok: true, userId: existing.id, role, invited: false };
  }

  const lang: Locale = isLocale(input.lang) ? input.lang : defaultLocale;
  const origin = await resolveOrigin();
  const redirectTo = new URL(`/${lang}/auth/callback`, origin).toString();

  const invite = await inviteEmployeeByEmail({
    email: input.email,
    fullName: input.fullName,
    redirectTo,
  });
  if (!invite.ok) return { ok: false, error: "invite_failed" };

  let authUserId = invite.userId;
  if (invite.alreadyInvited || !authUserId) {
    authUserId = await findAuthUserIdByEmail(input.email);
  }
  if (!authUserId) return { ok: false, error: "auth_email_conflict" };

  const created = await prisma.user.upsert({
    where: { id: authUserId },
    update: { email: input.email, fullName: input.fullName },
    create: {
      id: authUserId,
      email: input.email,
      fullName: input.fullName,
      role: input.role && FLOOR_ROLES.includes(input.role) ? input.role : "EMPLOYEE",
    },
  });
  await confirmAuthEmail(created.id);

  return { ok: true, userId: created.id, role: created.role, invited: !invite.alreadyInvited };
}

async function joinLocationChatChannels(input: {
  locationId: string;
  userId: string;
  stationId: string;
  role: Role;
}) {
  const channels = await prisma.chatChannel.findMany({
    where: {
      locationId: input.locationId,
      isArchived: false,
      ...(input.role === "EMPLOYEE"
        ? { OR: [{ stationId: null }, { stationId: input.stationId }] }
        : {}),
    },
    select: { id: true },
  });

  for (const channel of channels) {
    await prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: input.userId } },
      update: { canPost: true },
      create: { channelId: channel.id, userId: input.userId, canPost: true },
    });
  }
}

export type AddTeamMemberResult =
  | { ok: true; invited: boolean }
  | { ok: false; error: string };

export async function addTeamMember(input: {
  lang: string;
  locationId: string;
  email: string;
  stationId: string;
  fullName?: string;
  role?: Role;
}): Promise<AddTeamMemberResult> {
  try {
    const auth = await assertLocationManager(input.locationId);
    if (!auth.ok) return auth;

    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "missing_fields" };

    const requestedRole = input.role ?? "EMPLOYEE";
    if (!FLOOR_ROLES.includes(requestedRole)) {
      return { ok: false, error: "invalid_role" };
    }
    if (requestedRole !== "EMPLOYEE" && requestedRole !== "INSTRUCTOR" && requestedRole !== "FRONT_DESK") {
      const ownerAuth = await assertLocationOwner(input.locationId);
      if (!ownerAuth.ok) return ownerAuth;
    }

    const station = await prisma.station.findFirst({
      where: { id: input.stationId, locationId: input.locationId, isActive: true },
    });
    if (!station) return { ok: false, error: "invalid_station" };

    const ensured = await ensureTeamUser({
      email,
      fullName: input.fullName?.trim() || nameFromEmail(email),
      lang: input.lang,
      role: requestedRole,
    });
    if (!ensured.ok) return ensured;

    const existing = await prisma.locationMember.findUnique({
      where: { locationId_userId: { locationId: input.locationId, userId: ensured.userId } },
    });
    if (existing) return { ok: false, error: "already_member" };

    await prisma.locationMember.create({
      data: {
        locationId: input.locationId,
        userId: ensured.userId,
        stationId: input.stationId,
        isPrimary: true,
        hiredAt: new Date(),
      },
    });

    await joinLocationChatChannels({
      locationId: input.locationId,
      userId: ensured.userId,
      stationId: input.stationId,
      role: ensured.role,
    });

    if (ensured.role === "OWNER" || ensured.role === "ADMIN") {
      const location = await prisma.location.findUnique({
        where: { id: input.locationId },
        select: { organizationId: true },
      });
      if (location) {
        await seatBrandLeaderOnOrganization(ensured.userId, location.organizationId);
      }
    }

    if (ensured.role === "EMPLOYEE") {
      await bootstrapRecruitIntegrationAction({
        locationId: input.locationId,
        recruitUserId: ensured.userId,
        stationId: input.stationId,
      });
      await ensurePrimaryStationSkill({
        locationId: input.locationId,
        userId: ensured.userId,
        stationId: input.stationId,
      });
    }

    revalidateTeam(input.lang);
    return { ok: true, invited: ensured.invited };
  } catch (error) {
    return actionDatabaseError("team", error);
  }
}

export async function updateTeamMemberRole(input: {
  lang: string;
  locationId: string;
  memberId: string;
  role: Role;
}): Promise<TeamActionResult> {
  try {
    const auth = await assertLocationOwner(input.locationId);
    if (!auth.ok) return auth;

    if (!FLOOR_ROLES.includes(input.role)) {
      return { ok: false, error: "invalid_role" };
    }

    const member = await prisma.locationMember.findFirst({
      where: { id: input.memberId, locationId: input.locationId },
      include: { user: true },
    });
    if (!member) return { ok: false, error: "database_error" };
    if (member.userId === auth.userId) return { ok: false, error: "cannot_modify_self" };

    await prisma.user.update({
      where: { id: member.userId },
      data: { role: input.role },
    });

    revalidateTeam(input.lang);
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("team", error);
  }
}

export async function updateTeamMemberStation(input: {
  lang: string;
  locationId: string;
  memberId: string;
  stationId: string;
}): Promise<TeamActionResult> {
  try {
    const auth = await assertLocationManager(input.locationId);
    if (!auth.ok) return auth;

    const station = await prisma.station.findFirst({
      where: { id: input.stationId, locationId: input.locationId, isActive: true },
    });
    if (!station) return { ok: false, error: "invalid_station" };

    const member = await prisma.locationMember.findFirst({
      where: { id: input.memberId, locationId: input.locationId },
    });
    if (!member) return { ok: false, error: "database_error" };

    await prisma.locationMember.update({
      where: { id: member.id },
      data: { stationId: input.stationId },
    });

    revalidateTeam(input.lang);
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("team", error);
  }
}

export async function toggleStationAssignment(input: {
  lang: string;
  locationId: string;
  memberId: string;
  stationId: string;
}): Promise<TeamActionResult> {
  return updateTeamMemberStation(input);
}

export async function toggleMemberPrimary(input: {
  lang: string;
  locationId: string;
  memberId: string;
  isPrimary: boolean;
}): Promise<TeamActionResult> {
  try {
    const auth = await assertLocationManager(input.locationId);
    if (!auth.ok) return auth;

    const member = await prisma.locationMember.findFirst({
      where: { id: input.memberId, locationId: input.locationId },
    });
    if (!member) return { ok: false, error: "database_error" };

    if (input.isPrimary) {
      await prisma.locationMember.updateMany({
        where: { locationId: input.locationId, userId: member.userId },
        data: { isPrimary: false },
      });
    }

    await prisma.locationMember.update({
      where: { id: member.id },
      data: { isPrimary: input.isPrimary },
    });

    revalidateTeam(input.lang);
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("team", error);
  }
}

export async function removeTeamMember(input: {
  lang: string;
  locationId: string;
  memberId: string;
}): Promise<TeamActionResult> {
  try {
    const auth = await assertLocationOwner(input.locationId);
    if (!auth.ok) return auth;

    const member = await prisma.locationMember.findFirst({
      where: { id: input.memberId, locationId: input.locationId },
    });
    if (!member) return { ok: false, error: "database_error" };
    if (member.userId === auth.userId) return { ok: false, error: "cannot_modify_self" };

    await prisma.$transaction([
      prisma.staffDeparture.create({
        data: {
          locationId: input.locationId,
          userId: member.userId,
        },
      }),
      prisma.locationMember.delete({ where: { id: member.id } }),
    ]);
    revalidateTeam(input.lang);
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("team", error);
  }
}
