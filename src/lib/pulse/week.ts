/** Fuseau de référence pour la rotation Pulse (succursales QC). */
export const PULSE_TZ = "America/Toronto";

/**
 * Semaine ISO (lundi = début) + année ISO dans le fuseau Toronto.
 * Utilisé pour cibler PulseQuestion et l'idempotence hebdo.
 */
export function getPulseWeekParts(date: Date = new Date()): { weekNumber: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PULSE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);

  // Noon UTC sur la date civile Toronto — évite les bascules DST.
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = utcNoon.getUTCDay() || 7; // Mon=1 … Sun=7
  utcNoon.setUTCDate(utcNoon.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcNoon.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcNoon.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return { weekNumber, year: utcNoon.getUTCFullYear() };
}

/**
 * Bornes [start, end) de la semaine ISO courante (lundi 00:00 → lundi suivant),
 * exprimées en instants UTC approximés via America/Toronto.
 */
export function getPulseWeekBounds(date: Date = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PULSE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);

  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = utcNoon.getUTCDay() || 7;
  const monday = new Date(utcNoon);
  monday.setUTCDate(utcNoon.getUTCDate() - (day - 1));

  const monY = monday.getUTCFullYear();
  const monM = monday.getUTCMonth() + 1;
  const monD = monday.getUTCDate();

  const start = torontoMidnight(monY, monM, monD);
  const nextMon = new Date(Date.UTC(monY, monM - 1, monD + 7, 12, 0, 0));
  const end = torontoMidnight(nextMon.getUTCFullYear(), nextMon.getUTCMonth() + 1, nextMon.getUTCDate());

  return { start, end };
}

/** Instant UTC correspondant à 00:00 America/Toronto pour une date civile. */
function torontoMidnight(year: number, month: number, day: number): Date {
  const target = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // EST/EDT : minuit Toronto tombe entre 04:00 et 05:00 UTC.
  for (let hourUtc = 3; hourUtc <= 6; hourUtc++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const candidate = new Date(Date.UTC(year, month - 1, day, hourUtc, minute, 0));
      const label = new Intl.DateTimeFormat("en-CA", {
        timeZone: PULSE_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(candidate);
      const ymd = `${label.find((p) => p.type === "year")?.value}-${label.find((p) => p.type === "month")?.value}-${label.find((p) => p.type === "day")?.value}`;
      const hm = `${label.find((p) => p.type === "hour")?.value}:${label.find((p) => p.type === "minute")?.value}`;
      if (ymd === target && (hm === "00:00" || hm === "24:00")) {
        return candidate;
      }
    }
  }
  // Fallback EST (UTC-5).
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
}
