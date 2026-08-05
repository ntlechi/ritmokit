import type { FormationModuleKind } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Soft surfaces for teaching cards by content kind. */
export function modulePastel(kind: FormationModuleKind): string {
  if (kind === "CLASS_PLAN") return "bg-sky-500/10 border-sky-500/20";
  if (kind === "MOVES") return "bg-teal-500/10 border-teal-500/20";
  if (kind === "CHOREOGRAPHY") return "bg-rose-500/10 border-rose-500/20";
  if (kind === "SAFETY") return "bg-amber-500/10 border-amber-500/20";
  if (kind === "ONBOARDING") return "bg-emerald-500/10 border-emerald-500/20";
  return "bg-accent/10 border-accent/20";
}

export function moduleIconTone(kind: FormationModuleKind): string {
  if (kind === "CLASS_PLAN") return "bg-sky-500/15 text-sky-800 dark:text-sky-200";
  if (kind === "MOVES") return "bg-teal-500/15 text-teal-800 dark:text-teal-200";
  if (kind === "CHOREOGRAPHY") return "bg-rose-500/15 text-rose-800 dark:text-rose-200";
  if (kind === "SAFETY") return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  if (kind === "ONBOARDING") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  return "bg-accent/15 text-accent";
}

export function resolveLockedLabel(dict: Dictionary, lockedLabel: string | null): string | null {
  if (!lockedLabel) return null;
  if (lockedLabel === "hire_anchor_required") return dict.training.unlockHireRequired;
  if (lockedLabel.startsWith("unlock_day:")) {
    const day = lockedLabel.split(":")[1] ?? "1";
    return dict.training.unlocksOnDay.replace("{day}", day);
  }
  return lockedLabel;
}
