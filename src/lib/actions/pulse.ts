"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { submitPulseForUser, type PulseCoreResult } from "@/lib/pulse/core";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import { getPulseWeekParts } from "@/lib/pulse/week";

export type PulseActionResult = PulseCoreResult;

const PUNCH_PATH = "/[lang]/pointeuse";
const MANAGER_PULSE_PATH = "/[lang]/settings/manager/pulse";

export async function submitPulseResponseAction(input: {
  questionId: string;
  locationId: string;
  stationId: string;
  score: number;
}): Promise<PulseActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };

    const result = await submitPulseForUser(sessionUser.id, sessionUser.role, input);
    if (result.ok) {
      revalidatePath(PUNCH_PATH, "page");
      revalidatePath(MANAGER_PULSE_PATH, "page");
    }
    return result;
  } catch (error) {
    return actionDatabaseError("pulse", error);
  }
}

/** Skip soft — enregistre un reçu sans score pour ne pas re-prompt cette semaine. */
export async function dismissPulsePromptAction(input: {
  questionId: string;
}): Promise<PulseActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { ok: false, error: "unauthorized" };

    const { weekNumber, year } = getPulseWeekParts();
    const question = await prisma.pulseQuestion.findUnique({
      where: { id: input.questionId },
      select: { id: true, weekNumber: true, year: true },
    });
    if (!question) return { ok: false, error: "question_not_found" };
    if (question.weekNumber !== weekNumber || question.year !== year) {
      return { ok: false, error: "question_expired" };
    }

    await prisma.pulseReceipt.upsert({
      where: {
        userId_year_weekNumber: {
          userId: sessionUser.id,
          year,
          weekNumber,
        },
      },
      create: {
        userId: sessionUser.id,
        questionId: question.id,
        weekNumber,
        year,
      },
      update: {},
    });

    revalidatePath(PUNCH_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("pulse", error);
  }
}
