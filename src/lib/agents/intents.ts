/**
 * Routeur d'Intents — extrait une intention métier structurée d'un message
 * de chat en texte libre (FR/EN/ES).
 *
 * Chemin rapide : mots-clés (zéro réseau). Les paraphrases que ce chemin
 * rate sont classées par Jev System One dans `lib/jev/chat-intent.ts`,
 * derrière le même contrat `ChatIntent`.
 */

export type ChatIntent = { type: "late_arrival"; minutesLate: number } | { type: "none" };

const LATE_ARRIVAL_KEYWORDS =
  /\b(retard|en retard|late|running late|be late|arriver[ea]i? tard|tarde|llegar[eé] tarde|voy a llegar tarde)\b/i;

const MINUTES_PATTERNS: RegExp[] = [
  /(\d{1,3})\s*[- ]?\s*(?:min(?:ute)?s?)\b/i,
  /(\d{1,3})\s*(?:minutos?)\b/i,
];

const QUARTER_HOUR = /\b(quart d'heure|quarter[- ]?hour|cuarto de hora)\b/i;
const HALF_HOUR = /\b(demi-heure|half an? hour|media hora)\b/i;

/** Valeur par défaut prudente quand un retard est détecté sans durée explicite. */
export const DEFAULT_MINUTES_LATE = 10;
const MAX_PLAUSIBLE_MINUTES = 180;

const LATE_PARAPHRASE =
  /(?:^|[^\p{L}\p{N}_])(?:behind|delay(?:ed)?|d[eé]lai|plus tard|trafic|traffic|embouteillage|en route|on my way|en camino|serai l[aà]|be there in|je vais arriver|i(?:'|’)ll be|stuck|pris dans|dans \d{1,3}\s*min(?:ute)?s?|in \d{1,3}\s*min(?:ute)?s?|en \d{1,3}\s*minutos?)(?=$|[^\p{L}\p{N}_])/iu;

export function extractMinutesLate(body: string): number | null {
  const text = body.trim();
  for (const pattern of MINUTES_PATTERNS) {
    const match = text.match(pattern);
    const minutes = match ? Number(match[1]) : NaN;
    if (Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_PLAUSIBLE_MINUTES) {
      return minutes;
    }
  }
  if (QUARTER_HOUR.test(text)) return 15;
  if (HALF_HOUR.test(text)) return 30;
  return null;
}

export function detectChatIntent(body: string): ChatIntent {
  const text = body.trim();
  if (!text || !LATE_ARRIVAL_KEYWORDS.test(text)) {
    return { type: "none" };
  }
  return { type: "late_arrival", minutesLate: extractMinutesLate(text) ?? DEFAULT_MINUTES_LATE };
}

/** True when a message might be a personal delay the keyword router missed. */
export function needsJevLateCheck(body: string): boolean {
  const text = body.trim();
  if (text.length < 8 || text.length > 500) return false;
  return LATE_PARAPHRASE.test(text);
}
