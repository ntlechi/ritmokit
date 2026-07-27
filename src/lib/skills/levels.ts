import type { SkillLevel } from "@/generated/prisma/enums";

export const SKILL_LEVELS: SkillLevel[] = ["JUNIOR", "AUTONOME", "LEAD"];

export const SKILL_LEVEL_RANK: Record<SkillLevel, number> = {
  JUNIOR: 1,
  AUTONOME: 2,
  LEAD: 3,
};

/** Heures de rush où un Lead est requis si la station a ≥ 2 personnes planifiées. */
export const RUSH_HOURS = new Set([11, 12, 13, 17, 18, 19]);

export function isLeadOrAbove(level: SkillLevel | null | undefined): boolean {
  return level === "LEAD";
}

export function nextSkillLevel(level: SkillLevel): SkillLevel | null {
  if (level === "JUNIOR") return "AUTONOME";
  if (level === "AUTONOME") return "LEAD";
  return null;
}

export function skillMeetsMinimum(
  actual: SkillLevel | null | undefined,
  required: SkillLevel,
): boolean {
  if (!actual) return false;
  return SKILL_LEVEL_RANK[actual] >= SKILL_LEVEL_RANK[required];
}

export type StationSkillSnapshot = {
  userId: string;
  fullName: string;
  primaryStationId: string;
  skills: Partial<Record<string, SkillLevel>>;
};
