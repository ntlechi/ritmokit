/** Clés stables — lient Pulse, reviews et Culture Health (Chatman cohérence). */
export const BATI_VALUE_KEYS = [
  "VITESSE_SANS_CHAOS",
  "EQUIPE_DABORD",
  "FIABILITE_1TAP",
  "PROPRETE_SECURITE",
  "RESPECT",
] as const;

export type BatiValueKey = (typeof BATI_VALUE_KEYS)[number];

export type CultureValueSeed = {
  valueKey: BatiValueKey;
  sortOrder: number;
  titleFr: string;
  titleEn: string;
  titleEs: string;
  behaviorFr: string;
  behaviorEn: string;
  behaviorEs: string;
};

/** Constitution Bati Québec — 5 valeurs max, comportements observables au rush. */
export const BATI_CULTURE_CONSTITUTION: CultureValueSeed[] = [
  {
    valueKey: "VITESSE_SANS_CHAOS",
    sortOrder: 1,
    titleFr: "Vitesse sans chaos",
    titleEn: "Speed without chaos",
    titleEs: "Velocidad sin caos",
    behaviorFr:
      "Prioriser la cadence client sans jamais couper les coins ronds sur la sécurité CNESST.",
    behaviorEn:
      "Prioritize guest pace without ever cutting corners on CNESST safety.",
    behaviorEs:
      "Priorizar el ritmo del cliente sin recortar nunca la seguridad CNESST.",
  },
  {
    valueKey: "EQUIPE_DABORD",
    sortOrder: 2,
    titleFr: "L'équipe d'abord",
    titleEn: "Team first",
    titleEs: "El equipo primero",
    behaviorFr:
      "Prêter main-forte à la station voisine (ex. Emballage) avant de fermer sa propre zone au Comptoir.",
    behaviorEn:
      "Help the neighboring station (e.g. Packaging) before closing your own Counter zone.",
    behaviorEs:
      "Ayudar a la estación vecina (p. ej. Empaque) antes de cerrar tu propia zona de Mostrador.",
  },
  {
    valueKey: "FIABILITE_1TAP",
    sortOrder: 3,
    titleFr: "Fiabilité absolue",
    titleEn: "Absolute reliability",
    titleEs: "Fiabilidad absoluta",
    behaviorFr:
      "Ponctualité stricte au punch-in et communication immédiate via le flux 1-tap en cas de maladie.",
    behaviorEn:
      "Strict punctuality at clock-in and immediate 1-tap communication when sick.",
    behaviorEs:
      "Puntualidad estricta al fichar y comunicación inmediata 1-tap en caso de enfermedad.",
  },
  {
    valueKey: "PROPRETE_SECURITE",
    sortOrder: 4,
    titleFr: "Propreté & sécurité",
    titleEn: "Cleanliness & safety",
    titleEs: "Limpieza y seguridad",
    behaviorFr:
      "Signaler immédiatement un risque, maintenir la station propre, et ne jamais contourner une SOP sécurité.",
    behaviorEn:
      "Report risks immediately, keep the station clean, and never bypass a safety SOP.",
    behaviorEs:
      "Señalar riesgos de inmediato, mantener la estación limpia y nunca saltarse un SOP de seguridad.",
  },
  {
    valueKey: "RESPECT",
    sortOrder: 5,
    titleFr: "Respect",
    titleEn: "Respect",
    titleEs: "Respeto",
    behaviorFr:
      "Ton professionnel sous pression, feedback constructif, et inclusion de chaque équipier sur le plancher.",
    behaviorEn:
      "Professional tone under pressure, constructive feedback, and inclusion of every teammate on the floor.",
    behaviorEs:
      "Tono profesional bajo presión, feedback constructivo e inclusión de cada compañero en el piso.",
  },
];
