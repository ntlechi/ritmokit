import "server-only";

const TORONTO_TZ = "America/Toronto";

/**
 * Décalage (ms) entre l'heure murale de Toronto et UTC pour un instant donné.
 * Recalculé à chaque appel pour rester correct de part et d'autre du DST —
 * même approche que `finance/labor-kpis.ts` et `finance/tips.ts`.
 */
function getTorontoOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/**
 * Convertit un horodatage POS (UTC, ex. `closed_at` Cluster) en jour
 * d'affaires + heure murale de Toronto — même convention que
 * `getTorontoDayBounds().distributionDate` (date pure ancrée minuit UTC) et
 * les tranches horaires 0-23 du moteur Labor Cost.
 */
export function toTorontoBusinessBucket(instant: Date): { datePure: Date; hour: number } {
  const offsetMs = getTorontoOffsetMs(instant);
  const shifted = new Date(instant.getTime() + offsetMs);

  const datePure = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );

  return { datePure, hour: shifted.getUTCHours() };
}
