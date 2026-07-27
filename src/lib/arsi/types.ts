import { z } from "zod";
import type { FormationModuleKind } from "@/generated/prisma/enums";

const KINDS = ["SOP", "SAFETY", "RECIPE", "ONBOARDING"] as const;

export const arsiSopItemSchema = z.object({
  externalId: z.string().min(1).max(120),
  title: z.string().min(3).max(200),
  kind: z.enum(KINDS),
  /** Slug de station configurable (ex. cuisine, services) — résolu en stationId à l'import. */
  stationSlug: z.string().min(1).max(64).nullable().optional(),
  summary: z.string().max(500).optional().default(""),
  body: z.string().min(10),
  version: z.number().int().min(1).max(9999),
  isMandatory: z.boolean().optional().default(true),
  estimatedMinutes: z.number().int().min(1).max(180).optional().default(5),
  steps: z
    .array(
      z.union([
        z.string().min(1),
        z.object({
          order: z.number().int().min(1).optional(),
          title: z.string().min(1),
          body: z.string().optional().default(""),
        }),
      ]),
    )
    .optional()
    .default([]),
});

export const arsiImportPayloadSchema = z.object({
  organizationId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "invalid_organization_id"),
  sops: z.array(arsiSopItemSchema).min(1).max(500),
});

export type ArsiSopItem = z.infer<typeof arsiSopItemSchema>;
export type ArsiImportPayload = z.infer<typeof arsiImportPayloadSchema>;

export type NormalizedFormationStep = { order: number; title: string; body: string };

/** Convertit les étapes Arsi (chaînes ou objets) au format cartes flash Mirok. */
export function normalizeArsiSteps(raw: ArsiSopItem["steps"]): NormalizedFormationStep[] {
  return raw
    .map((step, index) => {
      if (typeof step === "string") {
        return { order: index + 1, title: step.trim(), body: "" };
      }
      return {
        order: step.order ?? index + 1,
        title: step.title.trim(),
        body: (step.body ?? "").trim(),
      };
    })
    .filter((step) => step.title.length > 0)
    .map((step, index) => ({ ...step, order: index + 1 }));
}

export function resolveArsiStationId(
  kind: FormationModuleKind,
  stationSlug?: string | null,
): string | null {
  if (kind === "ONBOARDING") return null;
  return stationSlug ?? null;
}
