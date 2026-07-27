import type { Locale } from "@/lib/i18n/config";

/** Libellé localisé d'un rayon — même convention que `stationLabel`. */
export function categoryName(
  category: { nameFr: string; nameEn: string; nameEs: string },
  locale: Locale,
): string {
  if (locale === "en") return category.nameEn;
  if (locale === "es") return category.nameEs;
  return category.nameFr;
}
