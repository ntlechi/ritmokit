import "server-only";

import { canAccessManagerSettings, getPrimaryMembership } from "@/lib/auth/session";
import { ACTIVE_INTEGRATION_STATUSES } from "@/lib/integrations/types";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export const STUDIO_SETUP_STEP_IDS = ["paypal", "season", "classes", "accueil"] as const;

export type StudioSetupStepId = (typeof STUDIO_SETUP_STEP_IDS)[number];

export type StudioSetupStatus = {
  locationId: string;
  locationName: string;
  organizationId: string;
  steps: Record<StudioSetupStepId, boolean>;
  /** Server-verified steps only (excludes accueil — marked on device). */
  serverComplete: boolean;
  serverDoneCount: number;
  serverTotal: number;
};

const SERVER_STEPS: StudioSetupStepId[] = ["paypal", "season", "classes"];

export async function getStudioSetupStatus(
  userId: string,
  role: Role,
): Promise<StudioSetupStatus | null> {
  if (!canAccessManagerSettings(role)) return null;

  const membership = await getPrimaryMembership(userId);
  if (!membership) return null;

  const organizationId = membership.location.organizationId;
  const locationId = membership.locationId;

  const [paypalRow, activeSeason, classCount] = await Promise.all([
    prisma.organizationIntegration.findFirst({
      where: {
        organizationId,
        provider: "PAYPAL",
        status: { in: ACTIVE_INTEGRATION_STATUSES },
      },
      select: { id: true },
    }),
    prisma.sessionSeason.findFirst({
      where: { locationId, status: "ACTIVE" },
      select: { id: true },
    }),
    prisma.classSession.count({
      where: {
        OR: [{ season: { locationId } }, { room: { locationId } }],
      },
    }),
  ]);

  const steps: Record<StudioSetupStepId, boolean> = {
    paypal: Boolean(paypalRow),
    season: Boolean(activeSeason),
    classes: classCount > 0,
    accueil: false,
  };

  const serverDoneCount = SERVER_STEPS.filter((id) => steps[id]).length;

  return {
    locationId,
    locationName: membership.location.name,
    organizationId,
    steps,
    serverComplete: serverDoneCount === SERVER_STEPS.length,
    serverDoneCount,
    serverTotal: SERVER_STEPS.length,
  };
}
