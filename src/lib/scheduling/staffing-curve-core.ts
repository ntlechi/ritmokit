export type StaffingProfileDefaults = {
  studentsPerHour: number;
  classMixSharePercent: number;
  minHeadcount: number;
  maxHeadcount: number;
};

/** Defaults keyed by dance department slug — fallback for unknown slugs. */
export const DEFAULT_STAFFING_PROFILE_BY_SLUG: Record<string, StaffingProfileDefaults> = {
  instructeurs: { studentsPerHour: 12, classMixSharePercent: 55, minHeadcount: 1, maxHeadcount: 6 },
  accueil: { studentsPerHour: 18, classMixSharePercent: 20, minHeadcount: 1, maxHeadcount: 3 },
  direction: { studentsPerHour: 8, classMixSharePercent: 10, minHeadcount: 1, maxHeadcount: 2 },
  entretien: { studentsPerHour: 20, classMixSharePercent: 5, minHeadcount: 1, maxHeadcount: 2 },
  "studio-a": { studentsPerHour: 15, classMixSharePercent: 30, minHeadcount: 1, maxHeadcount: 2 },
  "studio-b": { studentsPerHour: 12, classMixSharePercent: 25, minHeadcount: 1, maxHeadcount: 2 },
  "studio-c": { studentsPerHour: 10, classMixSharePercent: 15, minHeadcount: 1, maxHeadcount: 2 },
  "hall-accueil": { studentsPerHour: 20, classMixSharePercent: 10, minHeadcount: 1, maxHeadcount: 2 },
};

export const FALLBACK_STAFFING_DEFAULTS: StaffingProfileDefaults = {
  studentsPerHour: 12,
  classMixSharePercent: 20,
  minHeadcount: 1,
  maxHeadcount: 4,
};

export type StaffingProfileSnapshot = {
  stationId: string;
  studentsPerHour: number;
  classMixSharePercent: number;
  minHeadcount: number;
  maxHeadcount: number;
};

export function defaultProfileForStation(station: {
  id: string;
  slug: string | null;
}): StaffingProfileSnapshot {
  const slug = station.slug;
  const mapped =
    slug && LEGACY_STATION_SLUG_MAP[slug] ? LEGACY_STATION_SLUG_MAP[slug] : slug;
  const defaults = mapped
    ? (DEFAULT_STAFFING_PROFILE_BY_SLUG[mapped] ?? FALLBACK_STAFFING_DEFAULTS)
    : FALLBACK_STAFFING_DEFAULTS;
  return {
    stationId: station.id,
    studentsPerHour: defaults.studentsPerHour,
    classMixSharePercent: defaults.classMixSharePercent,
    minHeadcount: defaults.minHeadcount,
    maxHeadcount: defaults.maxHeadcount,
  };
}

/** Legacy station slugs → dance department defaults. */
const LEGACY_STATION_SLUG_MAP: Record<string, string> = {
  cuisine: "instructeurs",
  emballage: "instructeurs",
  comptoir: "accueil",
  services: "accueil",
  "gerants-jour": "direction",
  "gerants-soir": "direction",
  entretiens: "entretien",
};

export function computeRequiredHeadcountCurve(
  classRevenueByHour: number[],
  stationIds: string[],
  profiles: Record<string, StaffingProfileSnapshot>,
): Record<string, number[]> {
  const result: Record<string, number[]> = {};

  for (const stationId of stationIds) {
    const profile = profiles[stationId];
    if (!profile) {
      result[stationId] = new Array(24).fill(0);
      continue;
    }
    result[stationId] = classRevenueByHour.map((sales) => {
      if (sales <= 0) return 0;
      const stationSales = sales * (profile.classMixSharePercent / 100);
      const rawHeadcount = Math.ceil(stationSales / profile.studentsPerHour);
      return Math.min(Math.max(rawHeadcount, profile.minHeadcount), profile.maxHeadcount);
    });
  }

  return result;
}
