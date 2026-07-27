export type StaffingProfileDefaults = {
  targetSplh: number;
  salesSharePercent: number;
  minHeadcount: number;
  maxHeadcount: number;
};

/** Defaults keyed by station slug — fallback for unknown slugs. */
export const DEFAULT_STAFFING_PROFILE_BY_SLUG: Record<string, StaffingProfileDefaults> = {
  cuisine: { targetSplh: 65, salesSharePercent: 45, minHeadcount: 1, maxHeadcount: 5 },
  comptoir: { targetSplh: 50, salesSharePercent: 40, minHeadcount: 1, maxHeadcount: 4 },
  emballage: { targetSplh: 80, salesSharePercent: 15, minHeadcount: 1, maxHeadcount: 3 },
  entretiens: { targetSplh: 70, salesSharePercent: 10, minHeadcount: 1, maxHeadcount: 3 },
  services: { targetSplh: 55, salesSharePercent: 25, minHeadcount: 1, maxHeadcount: 4 },
  "gerants-jour": { targetSplh: 45, salesSharePercent: 10, minHeadcount: 1, maxHeadcount: 2 },
  "gerants-soir": { targetSplh: 45, salesSharePercent: 10, minHeadcount: 1, maxHeadcount: 2 },
};

export const FALLBACK_STAFFING_DEFAULTS: StaffingProfileDefaults = {
  targetSplh: 60,
  salesSharePercent: 20,
  minHeadcount: 1,
  maxHeadcount: 4,
};

export type StaffingProfileSnapshot = {
  stationId: string;
  targetSplh: number;
  salesSharePercent: number;
  minHeadcount: number;
  maxHeadcount: number;
};

export function defaultProfileForStation(station: {
  id: string;
  slug: string | null;
}): StaffingProfileSnapshot {
  const defaults = station.slug
    ? (DEFAULT_STAFFING_PROFILE_BY_SLUG[station.slug] ?? FALLBACK_STAFFING_DEFAULTS)
    : FALLBACK_STAFFING_DEFAULTS;
  return {
    stationId: station.id,
    targetSplh: defaults.targetSplh,
    salesSharePercent: defaults.salesSharePercent,
    minHeadcount: defaults.minHeadcount,
    maxHeadcount: defaults.maxHeadcount,
  };
}

export function computeRequiredHeadcountCurve(
  salesByHour: number[],
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
    result[stationId] = salesByHour.map((sales) => {
      if (sales <= 0) return 0;
      const stationSales = sales * (profile.salesSharePercent / 100);
      const rawHeadcount = Math.ceil(stationSales / profile.targetSplh);
      return Math.min(Math.max(rawHeadcount, profile.minHeadcount), profile.maxHeadcount);
    });
  }

  return result;
}
