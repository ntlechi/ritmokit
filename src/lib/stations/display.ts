import type { Locale } from "@/lib/i18n/config";
import type { StationKindValue } from "@/lib/stations/dance-defaults";

/** Poste configurable par succursale — remplace l'ancien enum Station. */
export type StationRecord = {
  id: string;
  locationId: string;
  nameFr: string;
  nameEn: string;
  nameEs: string;
  colorHex: string;
  slug: string | null;
  sortOrder: number;
  /** ROOM = bookable dance room; DEPARTMENT = roster grouping. */
  kind: StationKindValue;
  isActive: boolean;
  /** Dance room student capacity. */
  capacity: number | null;
  /** Floor area m² for $/m² analytics. */
  surfaceSqm: number | null;
};

export function stationLabel(station: Pick<StationRecord, "nameFr" | "nameEn" | "nameEs">, locale: Locale): string {
  if (locale === "en") return station.nameEn;
  if (locale === "es") return station.nameEs;
  return station.nameFr;
}

export function stationColorClass(colorHex: string): string {
  return colorHex;
}

/** Rail gauche des chips calendrier — couleur inline depuis colorHex. */
export function stationRailStyle(colorHex: string): { backgroundColor: string } {
  return { backgroundColor: colorHex };
}

export function stationDotStyle(colorHex: string): { backgroundColor: string } {
  return { backgroundColor: colorHex };
}

/**
 * Voile radial teinté par la couleur du poste — donne vie aux cartes héros
 * (calendrier mobile, pointeuse) sans compromettre la lisibilité.
 */
export function stationHeroTintStyle(colorHex: string): { background: string } {
  return {
    background: `radial-gradient(ellipse 110% 120% at 0% 0%, color-mix(in srgb, ${colorHex} 16%, transparent), transparent 62%)`,
  };
}

/** Halo doux dérivé de la couleur du poste (box-shadow inline). */
export function stationGlowStyle(colorHex: string): { boxShadow: string } {
  return {
    boxShadow: `0 0 0 1px color-mix(in srgb, ${colorHex} 22%, transparent), 0 6px 28px color-mix(in srgb, ${colorHex} 18%, transparent)`,
  };
}
