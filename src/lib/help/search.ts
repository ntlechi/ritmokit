import type { Role } from "@/generated/prisma/enums";
import type { Dictionary, HelpTopicCopy } from "@/lib/i18n/dictionaries";
import {
  HELP_FAQ_CATEGORIES,
  type HelpCategoryKey,
  type HelpTopicKey,
  topicsForRole,
} from "@/lib/help/config";

/** Mots trop courts ou trop communs pour départager un résultat. */
const MIN_TOKEN_LENGTH = 2;
const WORDS_PER_MINUTE = 170;

export type HelpSearchResult =
  | {
      kind: "topic";
      id: string;
      topicKey: HelpTopicKey;
      category: HelpCategoryKey;
      title: string;
      snippet: string;
      readMinutes: number;
      score: number;
    }
  | {
      kind: "faq";
      id: string;
      faqIndex: number;
      category: HelpCategoryKey;
      title: string;
      snippet: string;
      score: number;
    };

/**
 * Minuscules sans accents — « disponibilités » et « disponibilites » doivent
 * trouver la même fiche, et le personnel tape rarement les accents au comptoir.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(query: string): string[] {
  return normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

/** Durée de lecture dérivée du texte réel de la fiche — jamais une valeur inventée. */
export function estimateReadMinutes(topic: HelpTopicCopy): number {
  const words =
    countWords(topic.whatIs) +
    topic.steps.reduce((total, step) => total + countWords(step), 0) +
    (topic.tip ? countWords(topic.tip) : 0);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Champs pondérés : un mot dans le titre pèse plus qu'un mot noyé dans une étape.
 * `requireAll` exige que tous les mots de la requête apparaissent quelque part,
 * ce qui donne des résultats précis sur une phrase complète.
 */
function scoreFields(
  tokens: string[],
  phrase: string,
  requireAll: boolean,
  fields: Array<[string, number]>,
): number {
  let score = 0;
  const matched = new Set<string>();

  for (const [rawText, weight] of fields) {
    const text = normalizeText(rawText);
    if (phrase.length >= 3 && text.includes(phrase)) score += weight * 2;
    for (const token of tokens) {
      if (!text.includes(token)) continue;
      matched.add(token);
      score += weight;
      // Un mot en début de champ est presque toujours le sujet de la fiche.
      if (text.startsWith(token)) score += weight;
    }
  }

  if (matched.size === 0) return 0;
  return requireAll && matched.size < tokens.length ? 0 : score;
}

function collect(
  dict: Dictionary,
  role: Role,
  tokens: string[],
  phrase: string,
  requireAll: boolean,
): HelpSearchResult[] {
  const visible = topicsForRole(role);
  const results: HelpSearchResult[] = [];

  for (const meta of visible) {
    const copy = dict.help.topics[meta.key];
    const score = scoreFields(tokens, phrase, requireAll, [
      [copy.title, 8],
      [copy.tagline, 5],
      [copy.whatIs, 3],
      [copy.steps.join(" "), 2],
      [copy.tip ?? "", 1],
      [copy.ctaLabel, 1],
    ]);
    if (score === 0) continue;
    results.push({
      kind: "topic",
      id: `topic:${meta.key}`,
      topicKey: meta.key,
      category: meta.category,
      title: copy.title,
      snippet: copy.tagline,
      readMinutes: estimateReadMinutes(copy),
      score,
    });
  }

  const allowedCategories = new Set(visible.map((topic) => topic.category));

  dict.help.faq.forEach((item, index) => {
    const category = HELP_FAQ_CATEGORIES[index] ?? "team";
    // Une question de gestion ne s'affiche pas pour un équipier.
    if (!allowedCategories.has(category)) return;
    const score = scoreFields(tokens, phrase, requireAll, [
      [item.q, 7],
      [item.a, 3],
    ]);
    if (score === 0) return;
    results.push({
      kind: "faq",
      id: `faq:${index}`,
      faqIndex: index,
      category,
      title: item.q,
      snippet: item.a,
      score,
    });
  });

  return results;
}

export function searchHelp(
  dict: Dictionary,
  role: Role,
  query: string,
  limit = 8,
): HelpSearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const phrase = normalizeText(query.trim());

  // Phrase entière d'abord ; si elle ne donne rien, on retombe sur les mots
  // isolés — une question mal formulée doit quand même mener quelque part.
  const strict = collect(dict, role, tokens, phrase, true);
  const results = strict.length > 0 ? strict : collect(dict, role, tokens, phrase, false);

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
