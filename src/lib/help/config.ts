import type { Role } from "@/generated/prisma/enums";

/** Clés stables — liées aux entrées `dict.help.topics`. */
export const HELP_TOPIC_KEYS = [
  "schedule",
  "punch",
  "tips",
  "training",
  "messages",
  "availability",
  "managerSchedule",
  "weekTemplates",
  "managerTips",
  "managerSops",
] as const;

export type HelpTopicKey = (typeof HELP_TOPIC_KEYS)[number];

/** Regroupements du rail de gauche — liés aux entrées `dict.help.categories`. */
export const HELP_CATEGORY_KEYS = [
  "clock",
  "schedule",
  "money",
  "learning",
  "team",
  "manage",
] as const;

export type HelpCategoryKey = (typeof HELP_CATEGORY_KEYS)[number];

export type HelpTopicMeta = {
  key: HelpTopicKey;
  href: (lang: string) => string;
  /** Qui voit cette fiche sur le hub. */
  roles: Role[] | "all";
  category: HelpCategoryKey;
  managerOnly?: boolean;
};

export const HELP_TOPICS: HelpTopicMeta[] = [
  {
    key: "punch",
    href: (lang) => `/${lang}/pointeuse`,
    roles: "all",
    category: "clock",
  },
  {
    key: "schedule",
    href: (lang) => `/${lang}/calendar/mobile`,
    roles: "all",
    category: "schedule",
  },
  {
    key: "availability",
    href: (lang) => `/${lang}/settings/availability`,
    roles: "all",
    category: "schedule",
  },
  {
    key: "tips",
    href: (lang) => `/${lang}/calendar/mobile`,
    roles: "all",
    category: "money",
  },
  {
    key: "training",
    href: (lang) => `/${lang}/sops`,
    roles: "all",
    category: "learning",
  },
  {
    key: "messages",
    href: (lang) => `/${lang}/messages`,
    roles: "all",
    category: "team",
  },
  {
    key: "managerSchedule",
    href: (lang) => `/${lang}/calendar/manager/schedule`,
    roles: ["MANAGER", "OWNER", "ADMIN"],
    category: "manage",
    managerOnly: true,
  },
  {
    key: "weekTemplates",
    href: (lang) => `/${lang}/calendar/manager/schedule`,
    roles: ["MANAGER", "OWNER", "ADMIN"],
    category: "manage",
    managerOnly: true,
  },
  {
    key: "managerTips",
    href: (lang) => `/${lang}/settings/manager/tips`,
    roles: ["MANAGER", "OWNER", "ADMIN"],
    category: "manage",
    managerOnly: true,
  },
  {
    key: "managerSops",
    href: (lang) => `/${lang}/settings/training`,
    roles: ["MANAGER", "OWNER", "ADMIN"],
    category: "manage",
    managerOnly: true,
  },
];

/**
 * Catégorie de chaque question du FAQ, **alignée par index** sur `dict.help.faq`.
 * Toute question ajoutée au dictionnaire doit recevoir sa catégorie ici — la
 * longueur est vérifiée au rendu du centre d'aide.
 */
export const HELP_FAQ_CATEGORIES: HelpCategoryKey[] = [
  "schedule", // Je ne vois pas mon quart
  "clock", // La pointeuse me bloque
  "team", // Qu'est-ce que Pulse
  "team", // Où changer la langue
  "manage", // Enregistrer un modèle de semaine
  "manage", // Déplacer un quart publié
  "team", // Envoyer un message privé
  "schedule", // Code Rouge
];

/** Les gestes du quotidien mis en avant en haut du centre d'aide. */
const QUICK_START_EMPLOYEE: HelpTopicKey[] = ["punch", "schedule", "availability", "tips"];
const QUICK_START_MANAGER: HelpTopicKey[] = [
  "managerSchedule",
  "weekTemplates",
  "punch",
  "managerTips",
];

export function isHelpTopicKey(value: string): value is HelpTopicKey {
  return (HELP_TOPIC_KEYS as readonly string[]).includes(value);
}

export function isManagerRole(role: Role): boolean {
  return role === "MANAGER" || role === "OWNER" || role === "ADMIN";
}

export function topicsForRole(role: Role): HelpTopicMeta[] {
  return HELP_TOPICS.filter((t) => {
    if (t.roles === "all") return true;
    return t.roles.includes(role);
  });
}

export function quickStartForRole(role: Role): HelpTopicKey[] {
  return isManagerRole(role) ? QUICK_START_MANAGER : QUICK_START_EMPLOYEE;
}

export type HelpCategoryGroup = {
  key: HelpCategoryKey;
  topics: HelpTopicMeta[];
};

/** Catégories non vides pour ce rôle, dans l'ordre de `HELP_CATEGORY_KEYS`. */
export function categoriesForRole(role: Role): HelpCategoryGroup[] {
  const visible = topicsForRole(role);
  return HELP_CATEGORY_KEYS.map((key) => ({
    key,
    topics: visible.filter((topic) => topic.category === key),
  })).filter((group) => group.topics.length > 0);
}

export function topicMeta(key: HelpTopicKey): HelpTopicMeta {
  const found = HELP_TOPICS.find((topic) => topic.key === key);
  if (!found) throw new Error(`Unknown help topic: ${key}`);
  return found;
}
