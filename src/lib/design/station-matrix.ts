/**
 * Station Matrix — Fable / Modernist Organic color coding.
 * Maps station slugs (and loose name matches) to soft tint capsules.
 */

export type StationMatrixKey = "kitchen" | "service" | "drive" | "default";

export type StationMatrixTone = {
  key: StationMatrixKey;
  /** Capsule surface classes */
  capsule: string;
  /** Compact badge pill */
  badge: string;
  /** Progress / accent bar */
  bar: string;
};

const TONES: Record<StationMatrixKey, StationMatrixTone> = {
  kitchen: {
    key: "kitchen",
    capsule:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-100",
    badge:
      "border-emerald-500/25 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
    bar: "bg-emerald-500",
  },
  service: {
    key: "service",
    capsule:
      "border-amber-500/20 bg-amber-500/10 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-100",
    badge:
      "border-amber-500/25 bg-amber-500/15 text-amber-900 dark:text-amber-100",
    bar: "bg-amber-500",
  },
  drive: {
    key: "drive",
    capsule:
      "border-purple-500/20 bg-purple-500/10 text-purple-900 dark:border-purple-400/25 dark:bg-purple-500/15 dark:text-purple-100",
    badge:
      "border-purple-500/25 bg-purple-500/15 text-purple-900 dark:text-purple-100",
    bar: "bg-purple-500",
  },
  default: {
    key: "default",
    capsule:
      "border-zinc-300/80 bg-zinc-100/80 text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100",
    badge: "border-zinc-300/80 bg-zinc-100 text-zinc-700 dark:border-white/10 dark:bg-white/10 dark:text-zinc-200",
    bar: "bg-zinc-400",
  },
};

/** Autopilot / RSI / suggested unassigned shifts */
export const AUTOPILOT_CAPSULE =
  "border-2 border-dashed border-red-500/50 bg-red-500/5 text-red-900 dark:border-red-400/45 dark:bg-red-500/10 dark:text-red-100";

export const AUTOPILOT_BADGE =
  "border border-dashed border-red-500/50 bg-red-500/10 text-[10px] font-bold uppercase tracking-wider text-red-900 dark:text-red-100";

const KITCHEN_SLUGS = new Set(["cuisine", "kitchen", "prep", "grill", "fry"]);
const SERVICE_SLUGS = new Set([
  "services",
  "service",
  "caisse",
  "pos",
  "cashier",
  "salle",
  "floor",
  "host",
]);
const DRIVE_SLUGS = new Set([
  "drive",
  "pointeuse",
  "kiosk",
  "entretiens",
  "entretien",
  "delivery",
  "livraison",
]);

function matchKey(slug: string | null | undefined, nameHint?: string): StationMatrixKey {
  const s = (slug ?? "").toLowerCase().trim();
  if (s && KITCHEN_SLUGS.has(s)) return "kitchen";
  if (s && SERVICE_SLUGS.has(s)) return "service";
  if (s && DRIVE_SLUGS.has(s)) return "drive";

  const n = (nameHint ?? "").toLowerCase();
  if (/cuisine|kitchen|prep|grill/.test(n)) return "kitchen";
  if (/caisse|service|pos|salle|cashier|floor/.test(n)) return "service";
  if (/drive|pointeuse|livraison|delivery|entretien/.test(n)) return "drive";
  return "default";
}

export function resolveStationMatrix(
  station?: { slug?: string | null; nameFr?: string; nameEn?: string } | null,
): StationMatrixTone {
  if (!station) return TONES.default;
  const key = matchKey(station.slug, station.nameFr ?? station.nameEn);
  return TONES[key];
}

export function stationMatrixTone(key: StationMatrixKey): StationMatrixTone {
  return TONES[key];
}
