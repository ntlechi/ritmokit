/**
 * RitmoKit studio feature flags.
 * Flip a flag only when a gated module is ready for production.
 */
export const RITMOKIT_FEATURES = {
  /** Studio hygiene & safety training audit scope (CNESST/fiscal always on). */
  mapaqAudit: false,
} as const;
