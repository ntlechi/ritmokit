import type { Locale } from "@/lib/i18n/config";
import type { Role } from "@/generated/prisma/enums";
import { isManagerRole } from "@/lib/help/config";

/**
 * Nouveautés produit annoncées dans le centre d'aide.
 *
 * N'ajoutez une entrée que pour une fonctionnalité **réellement livrée** — c'est
 * la seule promesse que le personnel peut vérifier en cliquant. `month` est un
 * `YYYY-MM` (la précision au jour n'apporte rien et vieillit mal).
 */
export type HelpChangelogEntry = {
  id: string;
  month: string;
  audience: "all" | "manager";
  title: Record<Locale, string>;
  body: Record<Locale, string>;
  href: (lang: string) => string;
};

export const HELP_CHANGELOG: HelpChangelogEntry[] = [
  {
    id: "profile-dossier",
    month: "2026-07",
    audience: "all",
    title: {
      fr: "Mon profil devient un dossier complet",
      en: "My profile is now a full record",
      es: "Mi perfil ahora es un expediente completo",
    },
    body: {
      fr: "Ancienneté, formations, compétences par poste, shout-outs reçus et paie — tout au même endroit.",
      en: "Seniority, training, skills by station, shout-outs received and pay — all in one place.",
      es: "Antigüedad, formaciones, competencias por puesto, shout-outs recibidos y nómina — todo en un lugar.",
    },
    href: (lang) => `/${lang}/settings/profile`,
  },
  {
    id: "convention-foldable",
    month: "2026-07",
    audience: "all",
    title: {
      fr: "Convention de travail repliable",
      en: "Foldable workplace convention",
      es: "Convención de trabajo plegable",
    },
    body: {
      fr: "Chaque section s'ouvre à la demande — vous trouvez la règle qui vous concerne sans dérouler dix pages.",
      en: "Each section opens on demand — find the rule that applies to you without scrolling ten pages.",
      es: "Cada sección se abre a demanda — encuentra la regla que te aplica sin recorrer diez páginas.",
    },
    href: (lang) => `/${lang}/convention`,
  },
  {
    id: "week-start-choice",
    month: "2026-07",
    audience: "all",
    title: {
      fr: "Le calendrier commence le jour que vous voulez",
      en: "The calendar starts on the day you choose",
      es: "El calendario empieza el día que elijas",
    },
    body: {
      fr: "Dimanche ou lundi : votre choix est retenu sur cet appareil, pour la semaine comme pour le mois.",
      en: "Sunday or Monday: your choice is remembered on this device, for both week and month views.",
      es: "Domingo o lunes: tu elección se recuerda en este dispositivo, en vista semanal y mensual.",
    },
    href: (lang) => `/${lang}/calendar/week`,
  },
  {
    id: "week-templates",
    month: "2026-07",
    audience: "manager",
    title: {
      fr: "Modèles de semaine",
      en: "Week templates",
      es: "Plantillas de semana",
    },
    body: {
      fr: "Enregistrez une semaine qui fonctionne et réappliquez-la en un clic sur une semaine vide.",
      en: "Save a week that works and re-apply it to an empty week in one click.",
      es: "Guarda una semana que funciona y vuelve a aplicarla a una semana vacía con un clic.",
    },
    href: (lang) => `/${lang}/calendar/manager/schedule`,
  },
];

export function changelogForRole(role: Role, limit = 3): HelpChangelogEntry[] {
  const manager = isManagerRole(role);
  return HELP_CHANGELOG.filter((entry) => manager || entry.audience === "all").slice(0, limit);
}

/** « juillet 2026 » / « July 2026 » — depuis un `YYYY-MM`. */
export function formatChangelogMonth(month: string, lang: Locale): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, (monthIndex || 1) - 1, 1));
  return new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    date,
  );
}
