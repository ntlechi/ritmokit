import type { ShiftPeriod, ShiftStatus } from "@/generated/prisma/enums";

export const statusTone: Record<ShiftStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  PUBLISHED: "accent",
  PENDING_CONFIRMATION: "warning",
  CONFIRMED: "success",
  REJECTED: "danger",
  CRISIS_ALERT: "danger",
};

/** Left-border accent from station colorHex — inline style for shift chips. */
export function stationAccentStyle(colorHex: string): { borderLeftColor: string } {
  return { borderLeftColor: colorHex };
}

/** Rail plein (élément absolu) — couleur inline depuis colorHex. */
export function stationRailStyle(colorHex: string): { backgroundColor: string } {
  return { backgroundColor: colorHex };
}

/** Dot color for avatar station indicator. */
export function stationDotStyle(colorHex: string): { backgroundColor: string } {
  return { backgroundColor: colorHex };
}

/** Texte teinté par station — utilise la couleur hex directement. */
export function stationTextStyle(colorHex: string): { color: string } {
  return { color: colorHex };
}

/**
 * Jour vs soir — réservé à l'icône et au libellé. Les fonds pleins ambre /
 * indigo sont bannis des chips : le fond reste neutre (surface), la période
 * se lit par l'icône soleil / lune.
 */
export const periodStyle: Record<ShiftPeriod, { bg: string; text: string; ring: string }> = {
  DAY: {
    bg: "bg-shift-day-bg",
    text: "text-shift-day",
    ring: "ring-shift-day/30",
  },
  NIGHT: {
    bg: "bg-shift-night-bg",
    text: "text-shift-night",
    ring: "ring-shift-night/30",
  },
};
