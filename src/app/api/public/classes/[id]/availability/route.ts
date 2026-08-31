import type { NextRequest } from "next/server";
import { findTonightLesson, seasonWeekNumber } from "@/lib/data/course-lessons";
import { buildAvailabilityPayload, loadSessionCapacity } from "@/lib/public-api/capacity";
import { publicCorsPreflight, publicJson } from "@/lib/public-api/cors";
import { checkRateLimit, clientKey, pruneRateLimitBuckets } from "@/lib/public-api/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return publicCorsPreflight(request);
}

/**
 * GET /api/public/classes/[id]/availability
 * Live Lead/Follow parity inspector for public booking UIs.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  pruneRateLimitBuckets();
  const limit = checkRateLimit(clientKey(request, "public:availability"), {
    limit: 120,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return publicJson(
      request,
      { error: "rate_limited", retryAfterSec: limit.retryAfterSec },
      { status: 429 },
    );
  }

  const { id } = await context.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return publicJson(request, { error: "invalid_class_id" }, { status: 400 });
  }

  const session = await prisma.classSession.findUnique({
    where: { id },
    select: {
      id: true,
      maxLeads: true,
      maxFollows: true,
      season: { select: { status: true, bookingOpen: true, name: true, startsOn: true } },
      course: { select: { id: true, title: true, level: true, style: true } },
    },
  });

  if (!session) {
    return publicJson(request, { error: "session_not_found" }, { status: 404 });
  }

  const capacity = await loadSessionCapacity(id);
  if (!capacity) {
    return publicJson(request, { error: "session_not_found" }, { status: 404 });
  }

  const availability = buildAvailabilityPayload(capacity);
  const bookingOpen =
    !session.season || (session.season.status === "ACTIVE" && session.season.bookingOpen);
  const seasonWeek = session.season
    ? seasonWeekNumber(session.season.startsOn, new Date())
    : 1;
  const lesson = await findTonightLesson(session.course.id, seasonWeek);

  return publicJson(request, {
    ok: true,
    classId: session.id,
    title: session.course.title,
    level: session.course.level,
    style: session.course.style,
    seasonName: session.season?.name ?? null,
    bookingOpen,
    syllabus: lesson
      ? {
          weekNumber: lesson.weekNumber,
          seasonWeek,
          title: lesson.title,
          body: lesson.body,
          musicNote: lesson.musicNote,
          leadFocus: lesson.leadFocus,
          followFocus: lesson.followFocus,
          videoUrl: lesson.videoUrl,
        }
      : null,
    ...availability,
  });
}
