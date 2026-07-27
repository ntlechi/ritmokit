export type FormationStep = {
  order: number;
  title: string;
  body: string;
};

export function parseFormationSteps(raw: unknown): FormationStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is FormationStep =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as FormationStep).order === "number" &&
        typeof (item as FormationStep).title === "string" &&
        typeof (item as FormationStep).body === "string",
    )
    .sort((a, b) => a.order - b.order);
}
