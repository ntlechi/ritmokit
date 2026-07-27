import type { BatiValueKey } from "@/lib/culture/values";
import type { Locale } from "@/lib/i18n/config";
import type { DisciplineStep } from "@/generated/prisma/enums";

/** Version courante de la Convention de travail — plancher Bati. */
export const WORKPLACE_CONVENTION_VERSION = "1.0";

export const DISCIPLINE_WINDOW_MONTHS = 12;

export type ConventionSection = {
  id: string;
  cultureValueKey?: BatiValueKey;
  title: string;
  goldenRule: string;
  expected: string[];
  prohibited: string[];
  disciplineNote: string;
};

export type ConventionContent = {
  version: string;
  title: string;
  preamble: string;
  principles: string[];
  sections: ConventionSection[];
  disciplineLadder: { step: DisciplineStep; label: string; description: string }[];
  grossMisconduct: string[];
  legalNote: string;
  signatureStatement: string;
  goldenRules: string[];
};

export type WorkplaceInfractionCode =
  | "PHONE_USE"
  | "LATE_UNNOTIFIED"
  | "LATE_REPEAT"
  | "UNIFORM_NONCOMPLIANCE"
  | "RUSH_FOCUS"
  | "WORKPLACE_DISRESPECT"
  | "EMPLOYEE_MEAL_UNRECORDED"
  | "CONFIDENTIALITY_BREACH"
  | "HARASSMENT"
  | "THEFT"
  | "SUBSTANCE"
  | "PUNCH_FRAUD";

export type InfractionDefinition = {
  code: WorkplaceInfractionCode;
  cultureValueKey: BatiValueKey;
  isGrossMisconduct: boolean;
  requiresSignatureFromStep: DisciplineStep | null;
  labels: Record<Locale, string>;
  managerScripts: Record<Locale, string[]>;
};

const CONTENT_FR: ConventionContent = {
  version: WORKPLACE_CONVENTION_VERSION,
  title: "Convention de travail — Plancher Bati",
  preamble:
    "Cette convention établit les attentes claires pour chaque membre de l'équipe sur le plancher. Les règles protègent le travail de chacun, la sécurité CNESST et l'expérience client — elles ne visent pas à punir, mais à créer une équipe d'élite où tout le monde sait à quoi s'attendre.",
  principles: [
    "Clarté avant répression — on explique, on documente, on donne une chance de corriger.",
    "Cohérence entre gérants — les mêmes règles s'appliquent à tous, peu importe le quart.",
    "Respect du travail de l'équipe — chaque infraction qui ralentit le rush nuit aux collègues.",
    "Documentation dans Mirok — chaque coaching ou avertissement est archivé.",
    "La loi prime — cette convention complète le Code du travail et les normes CNESST.",
  ],
  sections: [
    {
      id: "phones",
      cultureValueKey: "VITESSE_SANS_CHAOS",
      title: "Téléphones cellulaires",
      goldenRule: "Le téléphone reste dans le casier pendant le quart.",
      expected: [
        "Donner le numéro de la cantine aux proches pour les urgences.",
        "Informer le gérant avant le quart si un appel critique est attendu (hôpital, famille).",
        "Exception approuvée : vibration en poche, réponse uniquement en cas d'appel urgent.",
      ],
      prohibited: [
        "Réseaux sociaux, jeux ou appels personnels en zone client ou en production.",
        "Photos ou vidéos de clients, cuisine ou caisse sans autorisation.",
      ],
      disciplineNote: "1er oubli : coaching. Répétition : avertissement écrit.",
    },
    {
      id: "punctuality",
      cultureValueKey: "FIABILITE_1TAP",
      title: "Ponctualité et présence",
      goldenRule: "Prêt au poste, en uniforme, à l'heure exacte du début du quart.",
      expected: [
        "Alerter via Mirok au moins 30 minutes avant si un retard est prévu.",
        "Arriver suffisamment tôt pour être opérationnel à l'heure du shift.",
      ],
      prohibited: [
        "Retard de plus de 5 minutes sans avis — le pointage nécessite validation gérant.",
        "Absence non avisée — traitée séparément, plus grave qu'un retard.",
      ],
      disciplineNote: "1er retard léger : coaching. Répétitions : échelle progressive.",
    },
    {
      id: "uniform",
      cultureValueKey: "PROPRETE_SECURITE",
      title: "Uniforme, hygiène et sécurité",
      goldenRule: "Image de marque et hygiène impeccables avant le pointage.",
      expected: [
        "Uniforme complet et propre (casquette, t-shirt/tablier fournis).",
        "Chaussures fermées antidérapantes — obligatoire CNESST.",
        "Cheveux longs attachés ; bijoux limités selon le poste.",
      ],
      prohibited: [
        "Pointer sans uniforme conforme.",
        "Contourner une procédure sécurité ou hygiène MAPAQ.",
      ],
      disciplineNote: "Risque sécurité : avertissement immédiat possible.",
    },
    {
      id: "focus",
      cultureValueKey: "VITESSE_SANS_CHAOS",
      title: "Focus au travail",
      goldenRule: "Si tu as le temps de t'accoter, tu as le temps de nettoyer.",
      expected: [
        "Camaraderie encouragée en période calme.",
        "Dès qu'un client entre ou qu'une commande pop : focus 100 % sur la production.",
        "Prêter main-forte à la station voisine avant de fermer sa zone.",
      ],
      prohibited: [
        "Baisse de cadence volontaire pendant le rush.",
        "Distractions qui font attendre les collègues ou les clients.",
      ],
      disciplineNote: "Traité comme manque de respect envers l'équipe.",
    },
    {
      id: "meals-theft",
      cultureValueKey: "RESPECT",
      title: "Repas employés, pertes et vols",
      goldenRule: "Tolérance zéro pour le vol — transparence totale via le POS.",
      expected: [
        "1 repas gratuit ou à 50 % par shift de 5 h et plus (selon politique locale).",
        "Tout repas, perte ou échantillon entré au système POS.",
      ],
      prohibited: [
        "Prendre de la nourriture sans autorisation ou sans entrée POS.",
        "Fouiller la caisse ou l'inventaire sans autorisation.",
      ],
      disciplineNote: "Vol qualifié : congédiement immédiat possible.",
    },
    {
      id: "respect",
      cultureValueKey: "RESPECT",
      title: "Respect des lieux et d'autrui",
      goldenRule: "Laisser le poste plus propre qu'à l'arrivée pour la prochaine brigade.",
      expected: [
        "Ton professionnel en tout temps, même sous pression du rush.",
        "Feedback constructif ; inclusion de chaque équipier sur le plancher.",
      ],
      prohibited: [
        "Harcèlement, intimidation, propos discriminatoires.",
        "Agressivité envers un collègue ou un client.",
      ],
      disciplineNote: "Harcèlement grave : faute grave, pas de gradation.",
    },
    {
      id: "substances-privacy",
      cultureValueKey: "PROPRETE_SECURITE",
      title: "Substances, confidentialité et médias",
      goldenRule: "Zéro alcool ou drogue sur le plancher ; confidentialité absolue.",
      expected: [
        "Signaler immédiatement tout risque pour la santé ou la sécurité.",
        "Protéger les données clients, ventes et horaires des collègues.",
      ],
      prohibited: [
        "État d'ébriété ou facultés affaiblies au travail.",
        "Contenu diffamatoire sur l'employeur ou les collègues en ligne.",
        "Partage de codes, mots de passe ou données de paie.",
      ],
      disciplineNote: "Intoxication ou fraude : faute grave.",
    },
  ],
  disciplineLadder: [
    {
      step: "VERBAL_COACHING",
      label: "Coaching verbal documenté",
      description:
        "Discussion privée avec le gérant. Note dans Mirok, sans conséquence financière. « Est-ce que tout va bien ? On a besoin de toi au rush. »",
    },
    {
      step: "WRITTEN_FIRST",
      label: "1er avertissement écrit",
      description:
        "Notification écrite détaillant la règle, les faits et les attentes. Signature employé requise dans Mirok.",
    },
    {
      step: "WRITTEN_SECOND_SUSPENSION",
      label: "2e avertissement + suspension 1 shift",
      description:
        "Dernier carton jaune. Suspension d'un quart. Prochaine étape : fin d'emploi.",
    },
    {
      step: "TERMINATION",
      label: "Congédiement",
      description: "Rupture du lien d'emploi pour non-respect répété des politiques.",
    },
  ],
  grossMisconduct: [
    "Vol qualifié (nourriture, caisse, inventaire)",
    "Fraude ou falsification de pointage",
    "Violence physique ou menaces graves",
    "Harcèlement grave ou comportement discriminatoire",
    "État d'ébriété ou facultés affaiblies sur le plancher",
    "Mise en danger délibérée d'un client ou collègue",
  ],
  legalNote:
    "Cette convention ne remplace pas le Code du travail du Québec, la LNT ni les normes CNESST. En cas de conflit, la loi et les règlements applicables priment.",
  signatureStatement:
    "Je certifie avoir lu et compris la Convention de travail — Plancher Bati v{version}. Je m'engage à respecter ces règles et à contribuer à une culture d'équipe d'élite.",
  goldenRules: [
    "Téléphone au casier — urgence via la cantine.",
    "Prêt au poste à l'heure — aviser 30 min avant si retard.",
    "Uniforme complet avant le pointage.",
    "Rush = focus total sur la production.",
    "Repas employé toujours entré au POS.",
    "Tolérance zéro : vol, harcèlement, intoxication.",
    "Poste plus propre qu'à l'arrivée.",
    "Ton professionnel en tout temps.",
    "Signaler les risques sécurité immédiatement.",
    "Documenter dans Mirok — cohérence entre gérants.",
  ],
};

const CONTENT_EN: ConventionContent = {
  version: WORKPLACE_CONVENTION_VERSION,
  title: "Workplace Convention — Bati Floor",
  preamble:
    "This convention sets clear expectations for every teammate on the floor. Rules protect each person's work, CNESST safety, and the guest experience — they aim to build an elite team, not to punish.",
  principles: [
    "Clarity before punishment — explain, document, give a fair chance to improve.",
    "Consistency across managers — the same rules apply to everyone, every shift.",
    "Respect for the team's work — anything that slows the rush hurts colleagues.",
    "Documentation in Mirok — every coaching session or warning is archived.",
    "Law comes first — this convention supplements Quebec labour law and CNESST standards.",
  ],
  sections: CONTENT_FR.sections.map((s, i) => ({
    ...s,
    title: [
      "Cell phones",
      "Punctuality and attendance",
      "Uniform, hygiene and safety",
      "Focus at work",
      "Employee meals, waste and theft",
      "Respect for the workplace and others",
      "Substances, privacy and social media",
    ][i],
    goldenRule: [
      "Phone stays in the locker during your shift.",
      "Ready at your station, in uniform, at shift start time.",
      "Impeccable brand image and hygiene before clock-in.",
      "If you have time to lean, you have time to clean.",
      "Zero tolerance for theft — full transparency through POS.",
      "Leave the station cleaner than you found it for the next crew.",
      "Zero alcohol or drugs on the floor; absolute confidentiality.",
    ][i],
    expected: s.expected.map((_, j) =>
      [
        [
          "Give the restaurant number to family for emergencies.",
          "Tell your manager before shift if a critical call is expected.",
          "Approved exception: vibrate in pocket, answer urgent calls only.",
        ],
        [
          "Alert via Mirok at least 30 minutes before if you'll be late.",
          "Arrive early enough to be operational at shift start.",
        ],
        [
          "Complete, clean uniform (hat, shirt/apron provided).",
          "Closed non-slip shoes — CNESST required.",
          "Long hair tied back; limited jewelry per station.",
        ],
        [
          "Camaraderie encouraged during calm periods.",
          "When a guest enters or an order pops: 100% focus on production.",
          "Help the neighboring station before closing your zone.",
        ],
        [
          "One free or 50% off meal per 5+ hour shift (per local policy).",
          "Every meal, waste or sample entered in POS.",
        ],
        [
          "Professional tone at all times, even under rush pressure.",
          "Constructive feedback; include every teammate on the floor.",
        ],
        [
          "Report any health or safety risk immediately.",
          "Protect guest data, sales and colleague schedules.",
        ],
      ][i][j] ?? "",
    ),
    prohibited: s.prohibited.map((_, j) =>
      [
        [
          "Social media, games or personal calls in guest or production zones.",
          "Photos or videos of guests, kitchen or POS without authorization.",
        ],
        [
          "More than 5 minutes late without notice — manager must validate punch.",
          "No-call no-show — handled separately, more serious than lateness.",
        ],
        [
          "Clocking in without compliant uniform.",
          "Bypassing a safety or MAPAQ hygiene procedure.",
        ],
        [
          "Voluntary slowdown during rush.",
          "Distractions that make colleagues or guests wait.",
        ],
        [
          "Taking food without authorization or POS entry.",
          "Searching cash or inventory without authorization.",
        ],
        [
          "Harassment, intimidation, discriminatory remarks.",
          "Aggression toward a colleague or guest.",
        ],
        [
          "Intoxication or impaired faculties at work.",
          "Defamatory content about the employer or colleagues online.",
          "Sharing codes, passwords or payroll data.",
        ],
      ][i][j] ?? "",
    ),
    disciplineNote: [
      "First slip: coaching. Repeat: written warning.",
      "First minor late: coaching. Repeats: progressive ladder.",
      "Safety risk: immediate written warning possible.",
      "Treated as disrespect toward the team.",
      "Qualified theft: immediate termination possible.",
      "Serious harassment: gross misconduct, no ladder.",
      "Intoxication or fraud: gross misconduct.",
    ][i],
  })),
  disciplineLadder: [
    {
      step: "VERBAL_COACHING",
      label: "Documented verbal coaching",
      description:
        "Private discussion with manager. Note in Mirok, no financial consequence.",
    },
    {
      step: "WRITTEN_FIRST",
      label: "First written warning",
      description: "Written notice detailing rule, facts and expectations. Employee signature required in Mirok.",
    },
    {
      step: "WRITTEN_SECOND_SUSPENSION",
      label: "Second written warning + 1-shift suspension",
      description: "Last formal warning. One shift suspended. Next step: termination.",
    },
    {
      step: "TERMINATION",
      label: "Termination",
      description: "End of employment for repeated policy violations.",
    },
  ],
  grossMisconduct: [
    "Qualified theft (food, cash, inventory)",
    "Fraud or falsified time punches",
    "Physical violence or serious threats",
    "Serious harassment or discriminatory behaviour",
    "Intoxication or impaired faculties on the floor",
    "Deliberate endangerment of a guest or colleague",
  ],
  legalNote:
    "This convention does not replace Quebec's Labour Code, labour standards or CNESST rules. Where they conflict, applicable law prevails.",
  signatureStatement:
    "I certify that I have read and understood the Workplace Convention — Bati Floor v{version}. I agree to follow these rules and contribute to an elite team culture.",
  goldenRules: [
    "Phone in locker — emergencies via restaurant line.",
    "Ready at station on time — notify 30 min before if late.",
    "Full uniform before clock-in.",
    "Rush = total production focus.",
    "Employee meals always entered in POS.",
    "Zero tolerance: theft, harassment, intoxication.",
    "Station cleaner than you found it.",
    "Professional tone at all times.",
    "Report safety risks immediately.",
    "Document in Mirok — consistency across managers.",
  ],
};

const CONTENT_ES: ConventionContent = {
  version: WORKPLACE_CONVENTION_VERSION,
  title: "Convención de trabajo — Piso Bati",
  preamble:
    "Esta convención establece expectativas claras para cada miembro del equipo en el piso. Las reglas protegen el trabajo de todos, la seguridad CNESST y la experiencia del cliente — buscan formar un equipo de élite, no castigar.",
  principles: [
    "Claridad antes que sanción — explicar, documentar, dar oportunidad de mejorar.",
    "Coherencia entre gerentes — las mismas reglas para todos, en cada turno.",
    "Respeto al trabajo del equipo — lo que frena el rush perjudica a los compañeros.",
    "Documentación en Mirok — cada coaching o advertencia queda archivado.",
    "La ley prevalece — esta convención complementa la ley laboral de Quebec y CNESST.",
  ],
  sections: CONTENT_FR.sections.map((s, i) => ({
    ...s,
    title: [
      "Teléfonos celulares",
      "Puntualidad y asistencia",
      "Uniforme, higiene y seguridad",
      "Enfoque en el trabajo",
      "Comidas, mermas y robos",
      "Respeto del lugar y de otros",
      "Sustancias, confidencialidad y redes",
    ][i],
    goldenRule: [
      "El teléfono queda en el casillero durante el turno.",
      "Listo en el puesto, con uniforme, a la hora de inicio.",
      "Imagen de marca e higiene impecables antes de fichar.",
      "Si tienes tiempo de apoyarte, tienes tiempo de limpiar.",
      "Tolerancia cero al robo — transparencia total vía POS.",
      "Dejar el puesto más limpio que al llegar.",
      "Cero alcohol o drogas en el piso; confidencialidad absoluta.",
    ][i],
    expected: s.expected.map((_, j) =>
      [
        [
          "Dar el número del restaurante a familiares para emergencias.",
          "Avisar al gerente antes del turno si espera una llamada crítica.",
          "Excepción aprobada: vibración en el bolsillo, solo llamadas urgentes.",
        ],
        [
          "Alertar por Mirok al menos 30 min antes si habrá retraso.",
          "Llegar con tiempo para estar operativo al inicio.",
        ],
        [
          "Uniforme completo y limpio (gorra, camiseta/delantal).",
          "Zapatos cerrados antideslizantes — obligatorio CNESST.",
          "Cabello largo recogido; joyas limitadas según puesto.",
        ],
        [
          "Camaradería en períodos tranquilos.",
          "Cuando entra un cliente o sale un pedido: 100 % en producción.",
          "Ayudar la estación vecina antes de cerrar tu zona.",
        ],
        [
          "1 comida gratis o 50 % por turno de 5+ horas (según política local).",
          "Toda comida, merma o muestra registrada en POS.",
        ],
        [
          "Tono profesional siempre, incluso bajo presión del rush.",
          "Feedback constructivo; incluir a cada compañero en el piso.",
        ],
        [
          "Reportar de inmediato cualquier riesgo de salud o seguridad.",
          "Proteger datos de clientes, ventas y horarios de compañeros.",
        ],
      ][i][j] ?? "",
    ),
    prohibited: s.prohibited.map((_, j) =>
      [
        [
          "Redes sociales, juegos o llamadas personales en zona cliente o producción.",
          "Fotos o videos de clientes, cocina o caja sin autorización.",
        ],
        [
          "Más de 5 min de retraso sin aviso — fichaje requiere validación del gerente.",
          "Ausencia sin avisar — se trata por separado, más grave.",
        ],
        [
          "Fichar sin uniforme conforme.",
          "Saltarse un procedimiento de seguridad o higiene MAPAQ.",
        ],
        [
          "Bajar el ritmo voluntariamente en rush.",
          "Distracciones que hacen esperar a compañeros o clientes.",
        ],
        [
          "Tomar comida sin autorización o sin entrada POS.",
          "Revisar caja o inventario sin autorización.",
        ],
        [
          "Acoso, intimidación, comentarios discriminatorios.",
          "Agresión hacia compañero o cliente.",
        ],
        [
          "Intoxicación o facultades alteradas en el trabajo.",
          "Contenido difamatorio sobre el empleador o compañeros en línea.",
          "Compartir códigos, contraseñas o datos de nómina.",
        ],
      ][i][j] ?? "",
    ),
    disciplineNote: [
      "Primer olvido: coaching. Repetición: advertencia escrita.",
      "Primer retraso leve: coaching. Repeticiones: escala progresiva.",
      "Riesgo seguridad: advertencia escrita inmediata posible.",
      "Se trata como falta de respeto al equipo.",
      "Robo calificado: despido inmediato posible.",
      "Acoso grave: falta grave, sin gradación.",
      "Intoxicación o fraude: falta grave.",
    ][i],
  })),
  disciplineLadder: [
    {
      step: "VERBAL_COACHING",
      label: "Coaching verbal documentado",
      description: "Conversación privada con el gerente. Nota en Mirok, sin consecuencia financiera.",
    },
    {
      step: "WRITTEN_FIRST",
      label: "1.ª advertencia escrita",
      description: "Aviso escrito con regla, hechos y expectativas. Firma del empleado en Mirok.",
    },
    {
      step: "WRITTEN_SECOND_SUSPENSION",
      label: "2.ª advertencia + suspensión 1 turno",
      description: "Última advertencia formal. Un turno suspendido. Siguiente paso: despido.",
    },
    {
      step: "TERMINATION",
      label: "Despido",
      description: "Fin de empleo por incumplimiento repetido de políticas.",
    },
  ],
  grossMisconduct: [
    "Robo calificado (comida, caja, inventario)",
    "Fraude o fichaje falsificado",
    "Violencia física o amenazas graves",
    "Acoso grave o conducta discriminatoria",
    "Intoxicación o facultades alteradas en el piso",
    "Poner en peligro deliberadamente a cliente o compañero",
  ],
  legalNote:
    "Esta convención no reemplaza el Código de trabajo de Quebec, las normas laborales ni CNESST. En caso de conflicto, prevalece la ley aplicable.",
  signatureStatement:
    "Certifico haber leído y comprendido la Convención de trabajo — Piso Bati v{version}. Me comprometo a respetar estas reglas y contribuir a una cultura de equipo de élite.",
  goldenRules: CONTENT_EN.goldenRules.map((_, i) =>
    [
      "Teléfono en casillero — emergencias vía restaurante.",
      "Listo en puesto a tiempo — avisar 30 min antes si hay retraso.",
      "Uniforme completo antes de fichar.",
      "Rush = enfoque total en producción.",
      "Comidas siempre registradas en POS.",
      "Tolerancia cero: robo, acoso, intoxicación.",
      "Puesto más limpio que al llegar.",
      "Tono profesional siempre.",
      "Reportar riesgos de seguridad de inmediato.",
      "Documentar en Mirok — coherencia entre gerentes.",
    ][i],
  ),
};

export const INFRACTION_DEFINITIONS: InfractionDefinition[] = [
  {
    code: "PHONE_USE",
    cultureValueKey: "VITESSE_SANS_CHAOS",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Usage du cellulaire", en: "Cell phone use", es: "Uso del celular" },
    managerScripts: {
      fr: [
        "J'ai remarqué que tu as utilisé ton téléphone en zone client. On a besoin de ton focus au rush — le cellulaire reste au casier. Est-ce que tout va bien?",
        "C'est la deuxième fois ce mois-ci. Voici ton premier avertissement écrit — signe dans Mirok pour confirmer.",
      ],
      en: [
        "I noticed you used your phone in the guest area. We need your focus at rush — phone stays in the locker. Is everything okay?",
        "This is the second time this month. Here is your first written warning — sign in Mirok to confirm.",
      ],
      es: [
        "Noté que usaste el teléfono en zona cliente. Necesitamos tu enfoque en rush — el celular queda en casillero. ¿Todo bien?",
        "Es la segunda vez este mes. Aquí está tu primera advertencia escrita — firma en Mirok.",
      ],
    },
  },
  {
    code: "LATE_UNNOTIFIED",
    cultureValueKey: "FIABILITE_1TAP",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Retard sans avis", en: "Unnotified lateness", es: "Retraso sin aviso" },
    managerScripts: {
      fr: [
        "Tu es arrivé(e) en retard sans prévenir l'équipe. On a besoin de toi à l'heure pour le rush — utilise Mirok 30 min avant si tu sais que tu seras en retard.",
        "Le retard se répète. Premier avertissement écrit — la prochaine étape inclut une suspension.",
      ],
      en: [
        "You arrived late without notifying the team. We need you on time for rush — use Mirok 30 min ahead if you know you'll be late.",
        "Lateness is repeating. First written warning — next step includes a suspension.",
      ],
      es: [
        "Llegaste tarde sin avisar al equipo. Te necesitamos a tiempo para el rush — usa Mirok 30 min antes si sabes que llegarás tarde.",
        "El retraso se repite. Primera advertencia escrita — el siguiente paso incluye suspensión.",
      ],
    },
  },
  {
    code: "LATE_REPEAT",
    cultureValueKey: "FIABILITE_1TAP",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Retards répétés", en: "Repeated lateness", es: "Retrasos repetidos" },
    managerScripts: {
      fr: ["Les retards nuisent à toute l'équipe. Coaching documenté aujourd'hui — on compte sur ta fiabilité."],
      en: ["Lateness hurts the whole team. Documented coaching today — we're counting on your reliability."],
      es: ["Los retrasos perjudican a todo el equipo. Coaching documentado hoy — contamos con tu fiabilidad."],
    },
  },
  {
    code: "UNIFORM_NONCOMPLIANCE",
    cultureValueKey: "PROPRETE_SECURITE",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Uniforme non conforme", en: "Uniform non-compliance", es: "Uniforme no conforme" },
    managerScripts: {
      fr: [
        "Tu n'étais pas en uniforme complet au pointage. L'image Bati et la sécurité CNESST exigent la tenue complète avant de commencer.",
      ],
      en: [
        "You weren't in full uniform at clock-in. Bati image and CNESST safety require complete attire before starting.",
      ],
      es: [
        "No estabas con uniforme completo al fichar. La imagen Bati y seguridad CNESST exigen tenida completa antes de empezar.",
      ],
    },
  },
  {
    code: "RUSH_FOCUS",
    cultureValueKey: "VITESSE_SANS_CHAOS",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Perte de focus au rush", en: "Loss of focus at rush", es: "Pérdida de enfoque en rush" },
    managerScripts: {
      fr: [
        "Pendant le rush, l'équipe a besoin de 100 % de focus. La camaraderie c'est bien en période calme — pas quand les clients attendent.",
      ],
      en: [
        "During rush, the team needs 100% focus. Camaraderie is fine when it's calm — not when guests are waiting.",
      ],
      es: [
        "Durante el rush, el equipo necesita 100 % de enfoque. La camaradería está bien en calma — no cuando los clientes esperan.",
      ],
    },
  },
  {
    code: "WORKPLACE_DISRESPECT",
    cultureValueKey: "RESPECT",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Manque de respect", en: "Disrespect", es: "Falta de respeto" },
    managerScripts: {
      fr: ["Le ton envers un collègue ou un client n'était pas professionnel. On corrige ça maintenant — le respect est non négociable chez Bati."],
      en: ["The tone toward a colleague or guest wasn't professional. We fix this now — respect is non-negotiable at Bati."],
      es: ["El tono hacia un compañero o cliente no fue profesional. Lo corregimos ahora — el respeto no es negociable en Bati."],
    },
  },
  {
    code: "EMPLOYEE_MEAL_UNRECORDED",
    cultureValueKey: "RESPECT",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Repas non entré au POS", en: "Meal not entered in POS", es: "Comida no registrada en POS" },
    managerScripts: {
      fr: ["Tout repas employé doit passer au POS — même le tien. C'est notre politique anti-vol et elle protège tout le monde."],
      en: ["Every employee meal must go through POS — including yours. It's our anti-theft policy and protects everyone."],
      es: ["Toda comida de empleado debe pasar por POS — incluida la tuya. Es nuestra política anti-robo y protege a todos."],
    },
  },
  {
    code: "CONFIDENTIALITY_BREACH",
    cultureValueKey: "RESPECT",
    isGrossMisconduct: false,
    requiresSignatureFromStep: "WRITTEN_FIRST",
    labels: { fr: "Bris de confidentialité", en: "Confidentiality breach", es: "Violación de confidencialidad" },
    managerScripts: {
      fr: ["Des informations confidentielles ont été partagées hors des outils Mirok. Ça ne peut pas se reproduire."],
      en: ["Confidential information was shared outside Mirok tools. This cannot happen again."],
      es: ["Se compartió información confidencial fuera de las herramientas Mirok. No puede repetirse."],
    },
  },
  {
    code: "HARASSMENT",
    cultureValueKey: "RESPECT",
    isGrossMisconduct: true,
    requiresSignatureFromStep: null,
    labels: { fr: "Harcèlement", en: "Harassment", es: "Acoso" },
    managerScripts: {
      fr: ["Comportement grave signalé. Enquête immédiate — faute grave possible sans gradation."],
      en: ["Serious behaviour reported. Immediate investigation — gross misconduct possible without ladder."],
      es: ["Conducta grave reportada. Investigación inmediata — falta grave posible sin gradación."],
    },
  },
  {
    code: "THEFT",
    cultureValueKey: "RESPECT",
    isGrossMisconduct: true,
    requiresSignatureFromStep: null,
    labels: { fr: "Vol", en: "Theft", es: "Robo" },
    managerScripts: {
      fr: ["Vol signalé ou confirmé. Tolérance zéro — congédiement immédiat possible."],
      en: ["Theft reported or confirmed. Zero tolerance — immediate termination possible."],
      es: ["Robo reportado o confirmado. Tolerancia cero — despido inmediato posible."],
    },
  },
  {
    code: "SUBSTANCE",
    cultureValueKey: "PROPRETE_SECURITE",
    isGrossMisconduct: true,
    requiresSignatureFromStep: null,
    labels: { fr: "Substances / intoxication", en: "Substances / intoxication", es: "Sustancias / intoxicación" },
    managerScripts: {
      fr: ["Présence d'alcool ou de drogue sur le plancher. Mise en sécurité immédiate — faute grave."],
      en: ["Alcohol or drugs on the floor. Immediate safety protocol — gross misconduct."],
      es: ["Alcohol o drogas en el piso. Protocolo de seguridad inmediato — falta grave."],
    },
  },
  {
    code: "PUNCH_FRAUD",
    cultureValueKey: "FIABILITE_1TAP",
    isGrossMisconduct: true,
    requiresSignatureFromStep: null,
    labels: { fr: "Fraude de pointage", en: "Time punch fraud", es: "Fraude de fichaje" },
    managerScripts: {
      fr: ["Falsification ou fraude de pointage détectée. Rupture de confiance — congédiement immédiat possible."],
      en: ["Time punch falsification or fraud detected. Breach of trust — immediate termination possible."],
      es: ["Falsificación o fraude de fichaje detectada. Ruptura de confianza — despido inmediato posible."],
    },
  },
];

export function getConventionContent(lang: Locale): ConventionContent {
  if (lang === "en") return CONTENT_EN;
  if (lang === "es") return CONTENT_ES;
  return CONTENT_FR;
}

export function getInfractionDefinition(code: WorkplaceInfractionCode): InfractionDefinition {
  const found = INFRACTION_DEFINITIONS.find((d) => d.code === code);
  if (!found) throw new Error(`Unknown infraction code: ${code}`);
  return found;
}

export function getInfractionLabel(code: WorkplaceInfractionCode, lang: Locale): string {
  return getInfractionDefinition(code).labels[lang];
}

const STEP_ORDER: DisciplineStep[] = [
  "VERBAL_COACHING",
  "WRITTEN_FIRST",
  "WRITTEN_SECOND_SUSPENSION",
  "TERMINATION",
];

export function resolveNextDisciplineStep(
  priorCount: number,
  isGrossMisconduct: boolean,
): DisciplineStep {
  if (isGrossMisconduct) return "GROSS_MISCONDUCT";
  if (priorCount <= 0) return "VERBAL_COACHING";
  if (priorCount === 1) return "WRITTEN_FIRST";
  if (priorCount === 2) return "WRITTEN_SECOND_SUSPENSION";
  return "TERMINATION";
}

export function getManagerScript(
  code: WorkplaceInfractionCode,
  lang: Locale,
  stepIndex: number,
): string {
  const def = getInfractionDefinition(code);
  const scripts = def.managerScripts[lang];
  return scripts[Math.min(stepIndex, scripts.length - 1)] ?? scripts[0];
}

export function stepRequiresEmployeeSignature(step: DisciplineStep): boolean {
  return step === "WRITTEN_FIRST" || step === "WRITTEN_SECOND_SUSPENSION";
}

export function disciplineStepIndex(step: DisciplineStep): number {
  if (step === "GROSS_MISCONDUCT") return -1;
  return STEP_ORDER.indexOf(step);
}
