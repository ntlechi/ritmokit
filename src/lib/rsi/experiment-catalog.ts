import "server-only";

/**
 * Catalogue RSI 3 — hypothèses UX autorisées uniquement.
 * Interdit : CNESST, paie, auth, Pulse deanonymization, schema.
 */

export const EXPERIMENT_HYPOTHESIS_KEYS = ["CULTURE_CARD_ABOVE_BUDDY"] as const;
export type ExperimentHypothesisKey = (typeof EXPERIMENT_HYPOTHESIS_KEYS)[number];

export const EXPERIMENT_TARGET_METRICS = ["SHOUTOUT_VOLUME"] as const;
export type ExperimentTargetMetric = (typeof EXPERIMENT_TARGET_METRICS)[number];

export type ExperimentFlagConfig = {
  /** Ordre mobile : culture card avant buddy (B) vs après (A). */
  cultureCardAboveBuddy: boolean;
};

export type HypothesisDefinition = {
  key: ExperimentHypothesisKey;
  targetMetric: ExperimentTargetMetric;
  liftThreshold: number;
  durationDays: number;
  descriptionFr: string;
  descriptionEn: string;
  descriptionEs: string;
  configVariantA: ExperimentFlagConfig;
  configVariantB: ExperimentFlagConfig;
};

export const HYPOTHESIS_CATALOG: Record<ExperimentHypothesisKey, HypothesisDefinition> = {
  CULTURE_CARD_ABOVE_BUDDY: {
    key: "CULTURE_CARD_ABOVE_BUDDY",
    targetMetric: "SHOUTOUT_VOLUME",
    liftThreshold: 0.15,
    durationDays: 28,
    descriptionFr:
      "Placer la carte Culture au-dessus du buddy augmente le volume de shout-outs de ≥ 15 % vs témoin.",
    descriptionEn:
      "Placing the Culture card above buddy increases shout-out volume by ≥ 15% vs control.",
    descriptionEs:
      "Colocar la tarjeta Culture encima del buddy aumenta el volumen de shout-outs ≥ 15 % vs control.",
    configVariantA: { cultureCardAboveBuddy: false },
    configVariantB: { cultureCardAboveBuddy: true },
  },
};

/** Défauts plateforme quand aucune expérience RUNNING/APPLIED. */
export const DEFAULT_PLATFORM_FLAGS: ExperimentFlagConfig = {
  cultureCardAboveBuddy: true,
};

export function isHypothesisKey(value: string): value is ExperimentHypothesisKey {
  return (EXPERIMENT_HYPOTHESIS_KEYS as readonly string[]).includes(value);
}

export function mergeFlagConfig(raw: unknown): ExperimentFlagConfig {
  const base = { ...DEFAULT_PLATFORM_FLAGS };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;
  const record = raw as Record<string, unknown>;
  return {
    cultureCardAboveBuddy:
      typeof record.cultureCardAboveBuddy === "boolean"
        ? record.cultureCardAboveBuddy
        : base.cultureCardAboveBuddy,
  };
}
