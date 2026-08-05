import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Footprints,
  HeartHandshake,
  Music2,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Folder icons for the teaching catalog. Keys are persisted in DB
 * (`TrainingCategory.icon`) — keep legacy keys mapped so old rows still resolve.
 */
export const CATEGORY_ICONS = {
  book: BookOpen,
  shield: ShieldCheck,
  clipboard: ClipboardCheck,
  plan: ClipboardList,
  moves: Footprints,
  choreo: Music2,
  sparkles: Sparkles,
  people: Users,
  service: HeartHandshake,
  /** Legacy QSR keys → dance-friendly icons (same key for DB rows). */
  chef: Music2,
  coffee: BookOpen,
  flame: Sparkles,
  snowflake: ShieldCheck,
  delivery: Users,
  recycle: HeartHandshake,
} satisfies Record<string, LucideIcon>;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

export const CATEGORY_ICON_KEYS = [
  "plan",
  "moves",
  "choreo",
  "book",
  "shield",
  "clipboard",
  "sparkles",
  "people",
  "service",
] as CategoryIconKey[];

export function categoryIcon(key: string | null): LucideIcon {
  if (key && key in CATEGORY_ICONS) return CATEGORY_ICONS[key as CategoryIconKey];
  return BookOpen;
}

/** Soft studio palette — avoid default purple AI look. */
export const CATEGORY_COLORS = [
  "#0f766e",
  "#0369a1",
  "#be123c",
  "#52525b",
  "#b45309",
  "#15803d",
  "#9f1239",
  "#1e3a5f",
] as const;
