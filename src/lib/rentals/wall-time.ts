/** Extract HH:mm from ClassSession DateTime (UTC wall-clock storage, same as Accueil). */
export function hhmmFromUtcDate(dt: Date): string {
  const h = String(dt.getUTCHours()).padStart(2, "0");
  const m = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function civilDateFromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
