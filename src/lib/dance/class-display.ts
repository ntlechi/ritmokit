/**
 * Display rules shared by class cards, the week grid, the cockpit and the
 * teacher view — pure so they can be unit-tested (scripts/test-studio-ops.mjs).
 */

export type CapacityTone = "open" | "almost" | "full";

/** From this fill ratio a class shows as "almost full". */
export const ALMOST_FULL_RATIO = 0.85;

export function capacityTone(booked: number, capacity: number): CapacityTone {
  if (capacity <= 0) return booked > 0 ? "full" : "open";
  if (booked >= capacity) return "full";
  return booked / capacity >= ALMOST_FULL_RATIO ? "almost" : "open";
}

export type BalanceState = "none" | "balanced" | "needsLeads" | "needsFollows";

/**
 * Lead/Follow warning. It fires once the gap reaches `maxImbalance`, the
 * point where the parity engine starts diverting the surplus role to the
 * waitlist, so staff know which role to recruit. `Infinity` (socials)
 * disables it.
 */
export function balanceState(leads: number, follows: number, maxImbalance: number): BalanceState {
  if (!Number.isFinite(maxImbalance) || leads + follows === 0) return "none";
  const gap = leads - follows;
  if (gap >= maxImbalance && gap > 0) return "needsFollows";
  if (-gap >= maxImbalance && gap < 0) return "needsLeads";
  return "balanced";
}

export type ClassLiveStatus = "upcoming" | "live" | "done";

/** Minutes since civil midnight. A class is "live" from its start until its end. */
export function classLiveStatus(nowMin: number, startMin: number, endMin: number): ClassLiveStatus {
  if (nowMin >= endMin) return "done";
  if (nowMin >= startMin) return "live";
  return "upcoming";
}

/**
 * Class times are stored as civil wall-clock in UTC fields (see
 * accueil-roster). Format them in UTC so the label is the studio's clock.
 */
export function wallClockLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function wallClockMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "lun. 19:30" for a recurring slot, "12 oct. 19:30" for a one-off. */
export function classSlotLabel(locale: string, dayOfWeek: number | null, startIso: string): string {
  const time = wallClockLabel(startIso);
  if (dayOfWeek != null && dayOfWeek >= 0 && dayOfWeek <= 6) {
    // 2023-01-01 was a Sunday: offset by dayOfWeek to get the weekday name.
    const ref = new Date(Date.UTC(2023, 0, 1 + dayOfWeek, 12));
    const day = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(ref);
    return `${day} ${time}`;
  }
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(startIso));
  return `${date} ${time}`;
}

/** Whole civil days between two instants (0 = same day, 1 = yesterday). */
export function daysAgo(iso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function relativeDayLabel(
  iso: string,
  copy: { today: string; yesterday: string; daysAgo: string },
  now: Date = new Date(),
): string {
  const n = daysAgo(iso, now);
  if (n === 0) return copy.today;
  if (n === 1) return copy.yesterday;
  return copy.daysAgo.replace("{n}", String(n));
}
