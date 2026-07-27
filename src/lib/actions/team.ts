"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@/generated/prisma/enums";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { bootstrapRecruitIntegrationAction } from "@/lib/actions/hr-excellence";
import { ensurePrimaryStationSkill } from "@/lib/actions/skills";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const OWNER_ROLES: Role[] = ["OWNER", "ADMIN"];
const FLOOR_ROLES: Role[] = ["EMPLOYEE", "MANAGER", "OWNER", "INSTRUCTOR", "FRONT_DESK"];

async function assertLocationManager(locationId: string): Promise<
  | { ok: true; userId: string; role: Role }
  | { ok: false; error: string }
> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return { ok: false, error: "unauthorized" };
  if (!canAccessManagerSettings(sessionUser.role)) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await prisma.locationMember.findUnique({
    where: { locationId_userId: { locationId, userId: sessionUser.id } },
  });
  if (!membership && sessionUser.role !== "ADMIN") {
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

  const membership = await prisma.locationMember.findUnique({
    where: { locationId_userId: { locationId, userId: sessionUser.id } },
  });
  if (!membership && sessionUser.role !== "ADMIN") {
    return { ok: false, error: "unauthorized" };
  }

  return { ok: true, userId: sessionUser.id };
}

function revalidateTeam(lang?: string) {
  if (lang) revalidatePath(`/${lang}/team`, "page");
  revalidatePath("/[lang]/team", "page");
}

export async function addTeamMember(input: {
  lang: string;
  locationId: string;
  email: string;
  stationId: string;
}): Promise<TeamActionResult> {
  try {
    const auth = await assertLocationManager(input.locationId);
    if (!auth.ok) return auth;

    const email = input.email.trim().toLowerCase();
    if (!email) return { ok: false, error: "missing_fields" };

    const station = await prisma.station.findFirst({
      where: { id: input.stationId, locationId: input.locationId, isActive: true },
    });
    if (!station) return { ok: false, error: "invalid_station" };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: false, error: "user_not_found" };

    const existing = await prisma.locationMember.findUnique({
      where: { locationId_userId: { locationId: input.locationId, userId: user.id } },
    });
    if (existing) return { ok: false, error: "already_member" };

    await prisma.locationMember.create({
      data: {
        locationId: input.locationId,
        userId: user.id,
        stationId: input.stationId,
        isPrimary: true,
      },
    });

    if (user.role === "EMPLOYEE") {
      await bootstrapRecruitIntegrationAction({
        locationId: input.locationId,
        recruitUserId: user.id,
        stationId: input.stationId,
      });
      await ensurePrimaryStationSkill({
        locationId: input.locationId,
        userId: user.id,
        stationId: input.stationId,
      });
    }

    revalidateTeam(input.lang);
    return { ok: true };
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
