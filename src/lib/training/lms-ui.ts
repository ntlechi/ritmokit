import type { FormationModuleKind } from "@/generated/prisma/enums";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Soft pastel surfaces for LMS course cards by kind. */
export function modulePastel(kind: FormationModuleKind): string {
  if (kind === "SAFETY") return "bg-red-500/10 border-red-500/20";
  if (kind === "RECIPE") return "bg-amber-500/10 border-amber-500/20";
  if (kind === "ONBOARDING") return "bg-purple-500/10 border-purple-500/20";
  return "bg-emerald-500/10 border-emerald-500/20";
}

export function moduleIconTone(kind: FormationModuleKind): string {
  if (kind === "SAFETY") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (kind === "RECIPE") return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  if (kind === "ONBOARDING") return "bg-purple-500/15 text-purple-800 dark:text-purple-200";
  return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
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
