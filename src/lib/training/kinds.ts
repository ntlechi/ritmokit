import type { FormationModuleKind } from "@/generated/prisma/enums";
import {
  BookOpen,
  ClipboardList,
  Footprints,
  Music2,
  Shield,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/** Stable order in owner pickers — teaching content first. */
export const FORMATION_MODULE_KINDS: FormationModuleKind[] = [
  "CLASS_PLAN",
  "MOVES",
  "CHOREOGRAPHY",
  "STUDIO_GUIDE",
  "ONBOARDING",
  "SAFETY",
];

export const FORMATION_KIND_ICONS: Record<FormationModuleKind, LucideIcon> = {
  CLASS_PLAN: ClipboardList,
  MOVES: Footprints,
  CHOREOGRAPHY: Music2,
  STUDIO_GUIDE: BookOpen,
  SAFETY: Shield,
  ONBOARDING: UserPlus,
};
