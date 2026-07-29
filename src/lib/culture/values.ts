/** Clés stables — lient Pulse, reviews et Culture Health. */
export const STUDIO_VALUE_KEYS = [
  "VITESSE_SANS_CHAOS",
  "EQUIPE_DABORD",
  "FIABILITE_1TAP",
  "PROPRETE_SECURITE",
  "RESPECT",
] as const;

export type StudioValueKey = (typeof STUDIO_VALUE_KEYS)[number];

export type CultureValueSeed = {
  valueKey: StudioValueKey;
  sortOrder: number;
  titleFr: string;
  titleEn: string;
  titleEs: string;
  behaviorFr: string;
  behaviorEn: string;
  behaviorEs: string;
};

/** Constitution studio — 5 valeurs max, comportements observables en cours et en Accueil. */
export const STUDIO_CULTURE_CONSTITUTION: CultureValueSeed[] = [
  {
    valueKey: "VITESSE_SANS_CHAOS",
    sortOrder: 1,
    titleFr: "Fluidité sans chaos",
    titleEn: "Flow without chaos",
    titleEs: "Fluidez sin caos",
    behaviorFr:
      "Accueillir et faire démarrer les cours à l'heure sans jamais sacrifier la sécurité des élèves ni la qualité pédagogique.",
    behaviorEn:
      "Welcome students and start classes on time without ever sacrificing student safety or teaching quality.",
    behaviorEs:
      "Recibir alumnos y empezar clases a tiempo sin sacrificar nunca la seguridad ni la calidad pedagógica.",
  },
  {
    valueKey: "EQUIPE_DABORD",
    sortOrder: 2,
    titleFr: "L'équipe d'abord",
    titleEn: "Team first",
    titleEs: "El equipo primero",
    behaviorFr:
      "Aider Accueil ou un collègue instructeur (check-in, salle, musique) avant de quitter le studio.",
    behaviorEn:
      "Help front desk or a fellow instructor (check-in, room setup, music) before leaving the studio.",
    behaviorEs:
      "Ayudar recepción o a un colega (check-in, sala, música) antes de salir del estudio.",
  },
  {
    valueKey: "FIABILITE_1TAP",
    sortOrder: 3,
    titleFr: "Fiabilité absolue",
    titleEn: "Absolute reliability",
    titleEs: "Fiabilidad absoluta",
    behaviorFr:
      "Ponctualité stricte au pointage et avis immédiat via RitmoKit en cas d'absence ou de retard.",
    behaviorEn:
      "Strict punctuality at clock-in and immediate RitmoKit notice for absence or lateness.",
    behaviorEs:
      "Puntualidad estricta al fichar y aviso inmediato en RitmoKit por ausencia o retraso.",
  },
  {
    valueKey: "PROPRETE_SECURITE",
    sortOrder: 4,
    titleFr: "Studio propre & sécuritaire",
    titleEn: "Clean & safe studio",
    titleEs: "Estudio limpio y seguro",
    behaviorFr:
      "Signaler un risque (sol, miroir, câble), laisser la salle prête pour le cours suivant, respecter les SOP CNESST.",
    behaviorEn:
      "Report hazards (floor, mirror, cables), leave the room ready for the next class, follow CNESST SOPs.",
    behaviorEs:
      "Señalar riesgos (piso, espejo, cables), dejar la sala lista para la siguiente clase, seguir SOP CNESST.",
  },
  {
    valueKey: "RESPECT",
    sortOrder: 5,
    titleFr: "Respect",
    titleEn: "Respect",
    titleEs: "Respeto",
    behaviorFr:
      "Ton professionnel avec élèves et collègues, feedback constructif, inclusion sur le plancher et en Accueil.",
    behaviorEn:
      "Professional tone with students and colleagues, constructive feedback, inclusion on the floor and at front desk.",
    behaviorEs:
      "Tono profesional con alumnos y colegas, feedback constructivo, inclusión en piso y recepción.",
  },
];
