import "server-only";

import { noul, score } from "@typesafe-ai/sdk";
import {
  DEFAULT_MINUTES_LATE,
  detectChatIntent,
  extractMinutesLate,
  needsJevLateCheck,
  type ChatIntent,
} from "@/lib/agents/intents";
import { getJevClient, jevEnabled } from "./client";

const LATE_NOUL_THRESHOLD = 0.75;
const MINUTE_BUCKETS = [10, 15, 30, 60, 90] as const;

function lateThreshold(): number {
  const raw = Number(process.env.JEV_LATE_NOUL_THRESHOLD);
  if (Number.isFinite(raw) && raw > 0 && raw < 1) return raw;
  return LATE_NOUL_THRESHOLD;
}

function minutesFromScore(value: number, confidence: number): number {
  if (confidence < 0.45) return DEFAULT_MINUTES_LATE;
  const index = Math.min(MINUTE_BUCKETS.length - 1, Math.max(0, Math.round(value)));
  return MINUTE_BUCKETS[index] ?? DEFAULT_MINUTES_LATE;
}

/**
 * Keyword router first. Jev System One runs only when that router found
 * nothing and the message still looks like a personal delay — one call,
 * then a high bar before a class or door shift is flagged.
 */
export async function resolveChatIntent(body: string): Promise<ChatIntent> {
  const fast = detectChatIntent(body);
  if (fast.type === "late_arrival" || !jevEnabled() || !needsJevLateCheck(body)) {
    return fast;
  }

  try {
    const response = await getJevClient().systemOne({
      state: {
        message: body.trim().slice(0, 500),
        context:
          "Chat message from a dance-studio instructor or front-desk staff member. Decide only whether the author is reporting their own lateness to a class, practica, or door shift.",
      },
      questions: {
        isLate: noul(
          "Is the author reporting that they personally will be late, are already late, or will arrive after their class or shift starts?",
          {
            true: "First person: delayed, stuck in traffic, arriving in N minutes, or coming later than expected.",
            false: "Someone else's delay, a class duration, a schedule question, a greeting, or no personal lateness.",
          },
        ),
        minutes: score("If they are late, how many minutes do they claim? If none is stated, use about 10.", [
          "about 10 minutes",
          "about 15 minutes",
          "about 30 minutes",
          "about 60 minutes",
          "about 90 minutes",
        ]),
      },
    });

    if (response.answers.isLate.noul < lateThreshold()) return fast;

    const stated = extractMinutesLate(body);
    return {
      type: "late_arrival",
      minutesLate: stated ?? minutesFromScore(response.answers.minutes.score, response.answers.minutes.confidence),
    };
  } catch {
    return fast;
  }
}
