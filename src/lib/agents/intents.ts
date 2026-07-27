/**
 * Routeur d'Intents — extrait une intention métier structurée d'un message
 * de chat en texte libre (FR/EN/ES). Volontairement une implémentation par
 * mots-clés/regex en v1 : le contrat de sortie (`ChatIntent`) est stable,
 * donc un classifieur LLM pourra remplacer `detectChatIntent` plus tard sans
 * toucher au trigger Postgres ni aux agents qui la consomment (voir
 * `lib/agents/handlers/late-arrival.ts`).
 */

export type ChatIntent = { type: "late_arrival"; minutesLate: number } | { type: "none" };

const LATE_ARRIVAL_KEYWORDS =
  /\b(retard|en retard|late|running late|be late|arriver[ea]i? tard|tarde|llegar[eé] tarde|voy a llegar tarde)\b/i;

const MINUTES_PATTERNS: RegExp[] = [
  /(\d{1,3})\s*[- ]?\s*(?:min(?:ute)?s?)\b/i, // "15 min", "15-minutes"
  /(\d{1,3})\s*(?:minutos?)\b/i, // "15 minutos"
];

const QUARTER_HOUR = /\b(quart d'heure|quarter[- ]?hour|cuarto de hora)\b/i;
const HALF_HOUR = /\b(demi-heure|half an? hour|media hora)\b/i;

/** Valeur par défaut prudente quand un retard est détecté sans durée explicite. */
const DEFAULT_MINUTES_LATE = 10;
const MAX_PLAUSIBLE_MINUTES = 180;

export function detectChatIntent(body: string): ChatIntent {
  const text = body.trim();
  if (!text || !LATE_ARRIVAL_KEYWORDS.test(text)) {
    return { type: "none" };
  }

  for (const pattern of MINUTES_PATTERNS) {
    const match = text.match(pattern);
    const minutes = match ? Number(match[1]) : NaN;
    if (Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_PLAUSIBLE_MINUTES) {
      return { type: "late_arrival", minutesLate: minutes };
    }
  }

  if (QUARTER_HOUR.test(text)) return { type: "late_arrival", minutesLate: 15 };
  if (HALF_HOUR.test(text)) return { type: "late_arrival", minutesLate: 30 };

  return { type: "late_arrival", minutesLate: DEFAULT_MINUTES_LATE };
}
