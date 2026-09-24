import "server-only";

import { TypeSafeClient } from "@typesafe-ai/sdk";

/**
 * Pinned System One release. `jev-latest` moves when TypeSafe ships;
 * late-arrival thresholds stay calibrated against this id.
 */
export const JEV_MODEL_ONE = "jev-1.13.0";

let client: TypeSafeClient | null = null;

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

/**
 * One client for the process. Jev answers every question in a request in
 * parallel, so callers batch questions into a single `systemOne` call.
 */
export function getJevClient(): TypeSafeClient {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("jev_unconfigured");
  }
  if (!client) {
    client = new TypeSafeClient({
      apiKey,
      defaultModel: process.env.TYPESAFE_DEFAULT_MODEL?.trim() || JEV_MODEL_ONE,
      logLevel: "warn",
      timeout: 4_000,
      retry: { maxRetries: 1, backoffInitialMs: 200, backoffMaxMs: 800 },
    });
  }
  return client;
}
