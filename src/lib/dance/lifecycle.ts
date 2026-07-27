import type { SessionSeasonStatus } from "@/generated/prisma/enums";

export type SeasonLifecycleState = {
  id: string;
  status: SessionSeasonStatus;
  bookingOpen: boolean;
  publishOn: Date | null;
};

export type PublishResult =
  | {
      ok: true;
      publishedId: string;
      archivedIds: string[];
      bookingOpen: true;
    }
  | { ok: false; reason: "not_draft" | "already_active" };

/**
 * Publish a draft season: it becomes ACTIVE + bookingOpen;
 * any previously ACTIVE seasons become ARCHIVED + bookingOpen false.
 */
export function planSeasonPublish(
  seasons: SeasonLifecycleState[],
  draftId: string,
): PublishResult {
  const draft = seasons.find((s) => s.id === draftId);
  if (!draft) return { ok: false, reason: "not_draft" };
  if (draft.status === "ACTIVE") return { ok: false, reason: "already_active" };
  if (draft.status !== "DRAFT") return { ok: false, reason: "not_draft" };

  const archivedIds = seasons.filter((s) => s.status === "ACTIVE").map((s) => s.id);
  return {
    ok: true,
    publishedId: draftId,
    archivedIds,
    bookingOpen: true,
  };
}

/** Calendar-date compare in America/Toronto-ish local day (date-only fields). */
export function shouldAutoPublish(
  season: SeasonLifecycleState,
  today: Date = new Date(),
): boolean {
  if (season.status !== "DRAFT" || !season.publishOn) return false;
  const publishDay = startOfUtcDay(season.publishOn);
  const todayDay = startOfUtcDay(today);
  return publishDay.getTime() <= todayDay.getTime();
}

export function canDeleteSeason(status: SessionSeasonStatus): boolean {
  return status !== "ACTIVE";
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
