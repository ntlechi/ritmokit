import {
  BookOpen,
  ChefHat,
  ClipboardCheck,
  Coffee,
  Flame,
  HeartHandshake,
  Recycle,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Palette d'icônes proposée aux rayons du catalogue. Les clés sont persistées
 * en base (`TrainingCategory.icon`), donc elles ne doivent pas être renommées.
 */
export const CATEGORY_ICONS = {
  book: BookOpen,
  shield: ShieldCheck,
  chef: ChefHat,
  coffee: Coffee,
  flame: Flame,
  snowflake: Snowflake,
  clipboard: ClipboardCheck,
  sparkles: Sparkles,
  people: Users,
  service: HeartHandshake,
  delivery: Truck,
  recycle: Recycle,
} satisfies Record<string, LucideIcon>;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

export function categoryIcon(key: string | null): LucideIcon {
  if (key && key in CATEGORY_ICONS) return CATEGORY_ICONS[key as CategoryIconKey];
  return BookOpen;
}

/** Teintes prêtes à l'emploi, cohérentes avec les couleurs de poste RitmoKit. */
export const CATEGORY_COLORS = [
  "#52525b",
  "#0f766e",
  "#1d4ed8",
  "#7c3aed",
  "#be123c",
  "#c2410c",
  "#a16207",
  "#15803d",
] as const;
