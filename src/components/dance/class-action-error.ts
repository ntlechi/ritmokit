import type { ClassRentalConflict } from "@/lib/rentals/class-conflicts";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function classActionErrorMessage(
  errors: Dictionary["dance"]["errors"],
  result: { error: string; rentalConflict?: ClassRentalConflict },
): string {
  const c = result.rentalConflict;
  if (result.error === "rental_conflict" && c) {
    const base = errors.rental_conflict
      .replace("{room}", c.room)
      .replace("{client}", c.client)
      .replace("{date}", c.date)
      .replace("{start}", c.start)
      .replace("{end}", c.end);
    return c.more > 0 ? `${base} ${errors.rental_conflict_more.replace("{n}", String(c.more))}` : base;
  }
  return errors[result.error as keyof typeof errors] ?? errors.generic;
}
