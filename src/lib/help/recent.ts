"use client";

import { useSyncExternalStore } from "react";
import { isHelpTopicKey, type HelpTopicKey } from "@/lib/help/config";

const STORAGE_KEY = "ritmokit-help-recent";
const MAX_RECENT = 6;

/**
 * Historique local des fiches ouvertes, gardé dans le navigateur.
 *
 * Volontairement hors base de données : c'est la mémoire de *cet* appareil, pas
 * une statistique d'équipe, et ça évite d'écrire côté serveur à chaque lecture.
 */
const EMPTY: readonly HelpTopicKey[] = [];

let cached: readonly HelpTopicKey[] = EMPTY;
let cachedRaw: string | null = null;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parse(raw: string | null): readonly HelpTopicKey[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter((value): value is HelpTopicKey =>
      typeof value === "string" && isHelpTopicKey(value),
    );
  } catch {
    return EMPTY;
  }
}

/** Snapshot stable — `useSyncExternalStore` compare avec `Object.is`. */
function readSnapshot(): readonly HelpTopicKey[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

function readServerSnapshot(): readonly HelpTopicKey[] {
  return EMPTY;
}

export function markHelpTopicOpened(topicKey: HelpTopicKey): void {
  if (typeof window === "undefined") return;
  const current = readSnapshot();
  const next = [topicKey, ...current.filter((key) => key !== topicKey)].slice(0, MAX_RECENT);
  if (next.length === current.length && next.every((key, index) => key === current[index])) {
    return;
  }
  const raw = JSON.stringify(next);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cached = next;
  for (const listener of listeners) listener();
}

export function useRecentHelpTopics(): readonly HelpTopicKey[] {
  return useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);
}
