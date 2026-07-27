import "server-only";

import { prisma } from "@/lib/prisma";
import { getPulseWeekParts } from "@/lib/pulse/week";

export type PulseCoreResult = { ok: true } | { ok: false; error: string };

function clampScore(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

/**
 * Soumission Pulse — anonymat structurel (réponse sans userId + receipt isolé).
 * Partagé par Server Action et harness k6.
 */
export async function submitPulseForUser(
  userId: string,
  role: string,
  input: {
    questionId: string;
    locationId: string;
    stationId: string;
    score: number;
  },
): Promise<PulseCoreResult> {
  const score = clampScore(input.score);
  if (score == null) return { ok: false, error: "invalid_score" };

  const member = await prisma.locationMember.findUnique({
    where: {
      locationId_userId: { locationId: input.locationId, userId },
    },
  });
  if (!member && role !== "ADMIN") {
    return { ok: false, error: "unauthorized" };
  }

  const station = await prisma.station.findFirst({
    where: { id: input.stationId, locationId: input.locationId, isActive: true },
    select: { id: true },
  });
  if (!station) return { ok: false, error: "invalid_station" };

  const question = await prisma.pulseQuestion.findUnique({
    where: { id: input.questionId },
    select: { id: true, weekNumber: true, year: true, isActive: true, organizationId: true },
  });
  if (!question || !question.isActive) return { ok: false, error: "question_not_found" };

  const { weekNumber, year } = getPulseWeekParts();
  if (question.weekNumber !== weekNumber || question.year !== year) {
    return { ok: false, error: "question_expired" };
  }

  const location = await prisma.location.findUnique({
    where: { id: input.locationId },
    select: { organizationId: true },
  });
  if (!location || location.organizationId !== question.organizationId) {
    return { ok: false, error: "unauthorized" };
  }

  const existingReceipt = await prisma.pulseReceipt.findUnique({
    where: {
      userId_year_weekNumber: {
        userId,
        year,
        weekNumber,
      },
    },
  });
  if (existingReceipt) return { ok: false, error: "already_submitted" };

  try {
    await prisma.$transaction([
      prisma.pulseResponse.create({
        data: {
          locationId: input.locationId,
          stationId: input.stationId,
          score,
          weekNumber,
          year,
          questionId: question.id,
        },
      }),
      prisma.pulseReceipt.create({
        data: {
          userId,
          questionId: question.id,
          weekNumber,
          year,
        },
      }),
    ]);
    return { ok: true };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { ok: false, error: "already_submitted" };
    }
    return { ok: false, error: "database_error" };
  }
}
