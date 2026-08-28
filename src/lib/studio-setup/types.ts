/** Client-safe setup types — do not import `@/lib/data/studio-setup` from client components. */

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
