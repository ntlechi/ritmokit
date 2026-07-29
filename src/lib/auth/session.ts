import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  profilePictureUrl: string | null;
  stationId: string | null;
  stationColorHex: string | null;
};

/**
 * Resolves the current user from Supabase Auth + Prisma.
 * Memoized per RSC request so nested layouts/pages do not re-hit Auth + DB.
 * Falls back to the seed manager in dev when no session exists.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return getDevFallbackUser();

    const user = await prisma.user.findUnique({
      where: { id: data.user.id },
      include: {
        locationMembers: {
          where: { isPrimary: true },
          take: 1,
          select: { stationId: true, station: { select: { colorHex: true } } },
        },
      },
    });
    if (!user) return getDevFallbackUser();

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      profilePictureUrl: user.profilePictureUrl,
      stationId: user.locationMembers[0]?.stationId ?? null,
      stationColorHex: user.locationMembers[0]?.station?.colorHex ?? null,
    };
  } catch {
    return getDevFallbackUser();
  }
});

/** Primary location membership — cached once per request. */
export const getPrimaryMembership = cache(async (userId: string) => {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: { select: { id: true, name: true, organizationId: true, timezone: true } },
    },
  });
});

async function getDevFallbackUser(): Promise<SessionUser | null> {
  if (process.env.NODE_ENV === "production") return null;
  const memberships = {
    where: { isPrimary: true },
    take: 1,
    select: { stationId: true, station: { select: { colorHex: true } } },
  } as const;

  // On privilégie le propriétaire : ses droits englobent ceux du gérant, donc
  // toutes les pages (dont le catalogue de formation) restent atteignables.
  const user =
    (await prisma.user.findFirst({
      where: { role: "OWNER" },
      include: { locationMembers: memberships },
    })) ??
    (await prisma.user.findFirst({
      where: { role: "MANAGER" },
      include: { locationMembers: memberships },
    }));
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    profilePictureUrl: user.profilePictureUrl,
    stationId: user.locationMembers[0]?.stationId ?? null,
    stationColorHex: user.locationMembers[0]?.station?.colorHex ?? null,
  };
}

export {
  canAccessAdminSettings,
  canAccessAccueil,
  canAccessManagerSettings,
  canManageTrainingCatalog,
} from "@/lib/auth/session-client";
