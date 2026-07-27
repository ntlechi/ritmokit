import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type HelpSupportContact = {
  userId: string;
  fullName: string;
  role: Role;
  profilePictureUrl: string | null;
};

export type HelpContext = {
  locationName: string | null;
  supportContact: HelpSupportContact | null;
};

/**
 * Contexte du centre d'aide : la succursale affichée dans l'en-tête et la
 * personne à qui écrire.
 *
 * Le contact est un gérant·e (à défaut un propriétaire) de **la même
 * succursale**, puisque c'est la seule conversation directe que
 * `startDirectConversationAction` autorisera ensuite. Le plus ancien membre de
 * direction est retenu — c'est le rattachement le plus stable quand une
 * succursale en compte plusieurs.
 */
export async function getHelpContext(userId: string): Promise<HelpContext> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true, location: { select: { name: true } } },
  });
  if (!membership) return { locationName: null, supportContact: null };

  const candidates = await prisma.locationMember.findMany({
    where: {
      locationId: membership.locationId,
      userId: { not: userId },
      user: { role: { in: ["MANAGER", "OWNER"] } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      user: {
        select: { id: true, fullName: true, role: true, profilePictureUrl: true },
      },
    },
  });

  const preferred = candidates.find((row) => row.user.role === "MANAGER") ?? candidates[0] ?? null;

  return {
    locationName: membership.location.name,
    supportContact: preferred
      ? {
          userId: preferred.user.id,
          fullName: preferred.user.fullName,
          role: preferred.user.role,
          profilePictureUrl: preferred.user.profilePictureUrl,
        }
      : null,
  };
}
