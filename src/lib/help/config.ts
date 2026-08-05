import type { Role } from "@/generated/prisma/enums";

/** Clés stables — liées aux entrées `dict.help.topics`. */
export const HELP_TOPIC_KEYS = [
  "gettingStarted",
  "accueil",
  "sessions",
  "cockpit",
  "integrations",
  "agentics",
  "enrollmentsWaitlist",
  "schedule",
  "punch",
  "training",
  "messages",
  "availability",
  "managerSchedule",
  "weekTemplates",
  "managerSops",
] as const;

export type HelpTopicKey = (typeof HELP_TOPIC_KEYS)[number];

/** Regroupements du rail de gauche — liés aux entrées `dict.help.categories`. */
export const HELP_CATEGORY_KEYS = [
  "studio",
  "payments",
  "manage",
  "team",
  "schedule",
  "clock",
  "learning",
] as const;

export type HelpCategoryKey = (typeof HELP_CATEGORY_KEYS)[number];

const STUDIO_OPS_ROLES: Role[] = ["OWNER", "MANAGER", "ADMIN"];
const FRONT_DESK_ROLES: Role[] = [...STUDIO_OPS_ROLES, "FRONT_DESK"];

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
    key: "gettingStarted",
    href: (lang) => `/${lang}/settings/manager/integrations`,
    roles: STUDIO_OPS_ROLES,
    category: "studio",
    managerOnly: true,
  },
  {
    key: "accueil",
    href: (lang) => `/${lang}/accueil`,
    roles: FRONT_DESK_ROLES,
    category: "studio",
  },
  {
    key: "sessions",
    href: (lang) => `/${lang}/sessions`,
    roles: STUDIO_OPS_ROLES,
    category: "studio",
    managerOnly: true,
  },
  {
    key: "cockpit",
    href: (lang) => `/${lang}/dashboard`,
    roles: STUDIO_OPS_ROLES,
    category: "studio",
    managerOnly: true,
  },
  {
    key: "agentics",
    href: (lang) => `/${lang}/accueil`,
    roles: FRONT_DESK_ROLES,
    category: "studio",
  },
  {
    key: "integrations",
    href: (lang) => `/${lang}/settings/manager/integrations`,
    roles: STUDIO_OPS_ROLES,
    category: "payments",
    managerOnly: true,
  },
  {
    key: "enrollmentsWaitlist",
    href: (lang) => `/${lang}/sessions`,
    roles: STUDIO_OPS_ROLES,
    category: "payments",
    managerOnly: true,
  },
  {
    key: "punch",
    href: (lang) => `/${lang}/pointeuse`,
    /** Hourly staff only — most dance studios don't use day-to-day clock-in. */
    roles: ["EMPLOYEE"],
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
    roles: STUDIO_OPS_ROLES,
    category: "manage",
    managerOnly: true,
  },
  {
    key: "weekTemplates",
    href: (lang) => `/${lang}/calendar/manager/schedule`,
    roles: STUDIO_OPS_ROLES,
    category: "manage",
    managerOnly: true,
  },
  {
    key: "managerSops",
    href: (lang) => `/${lang}/settings/training`,
    roles: STUDIO_OPS_ROLES,
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
  "studio", // Not tech savvy — where to start
  "studio", // Check in students at the front desk
  "studio", // Follow can't enroll online
  "payments", // Connect PayPal
  "studio", // Agentics rail
  "studio", // Lead/Follow balance
  "payments", // Waitlist auto-promote
  "team", // Students in Messages
  "team", // Change language
  "studio", // Yield vs head count
  "studio", // Release no-show seat
  "schedule", // Don't see my shift
  "team", // Time clock optional for dance studios
];

/** Les gestes du quotidien mis en avant en haut du centre d'aide. */
const QUICK_START_EMPLOYEE: HelpTopicKey[] = ["schedule", "messages", "training", "availability"];
const QUICK_START_MANAGER: HelpTopicKey[] = [
  "gettingStarted",
  "accueil",
  "integrations",
  "sessions",
];
const QUICK_START_FRONT_DESK: HelpTopicKey[] = ["accueil", "agentics", "messages"];
const QUICK_START_INSTRUCTOR: HelpTopicKey[] = ["schedule", "messages", "training"];

export const POPULAR_EMPLOYEE: HelpTopicKey[] = [
  "schedule",
  "messages",
  "training",
  "availability",
  "punch",
];
export const POPULAR_MANAGER: HelpTopicKey[] = [
  "gettingStarted",
  "accueil",
  "sessions",
  "integrations",
  "agentics",
  "enrollmentsWaitlist",
];
export const POPULAR_FRONT_DESK: HelpTopicKey[] = ["accueil", "agentics", "messages"];
export const POPULAR_INSTRUCTOR: HelpTopicKey[] = ["schedule", "messages", "training"];

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
  if (isManagerRole(role)) return QUICK_START_MANAGER;
  if (role === "FRONT_DESK") return QUICK_START_FRONT_DESK;
  if (role === "INSTRUCTOR") return QUICK_START_INSTRUCTOR;
  return QUICK_START_EMPLOYEE;
}

export function popularForRole(role: Role): HelpTopicKey[] {
  if (isManagerRole(role)) return POPULAR_MANAGER;
  if (role === "FRONT_DESK") return POPULAR_FRONT_DESK;
  if (role === "INSTRUCTOR") return POPULAR_INSTRUCTOR;
  return POPULAR_EMPLOYEE;
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
