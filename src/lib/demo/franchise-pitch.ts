/**
 * Demo Franchise pitch data — no DB required.
 * Day scrubber (1–5) recomputes modules, coaching, and alerts for investors/Marie.
 */

export type DemoBrandKit = {
  name: string;
  slug: string;
  logoMark: string;
  primaryColor: string;
  welcomeCopy: string;
  rewardMessage: string;
  managerMessageWeek1: string;
};

export type DemoModuleStatus = "done" | "active" | "locked";

export type DemoModule = {
  id: string;
  title: string;
  unlockDay: number;
  estimatedMinutes: number;
  sections?: { title: string; minutes: number }[];
};

export type DemoEmployeeStatus = "on_floor" | "late" | "onboarding_j1" | "off";

export type DemoEmployee = {
  id: string;
  fullName: string;
  initials: string;
  role: string;
  station: string;
  pin: string;
  trainingPercent: number;
  status: DemoEmployeeStatus;
  hireDayOffset: number;
};

export type DemoCoachingAction = {
  employeeId: string;
  level: number;
  priority: "high" | "normal";
  body: string;
  script: string;
  primaryCta: string;
  secondaryCta: string;
  visibleFromDay: number;
};

export type DemoAlert = {
  id: string;
  tone: "danger" | "success" | "warn";
  title: string;
  body: string;
  minutesAgo: number;
  visibleFromDay: number;
};

export const DEMO_BRAND: DemoBrandKit = {
  name: "RitmoKit Demo",
  slug: "ritmokit-demo",
  logoMark: "RK",
  primaryColor: "#E11D48",
  welcomeCopy:
    "Ton application studio. Horaires, Accueil, formations et tout ce qu'il te faut pour enseigner ou accueillir.",
  rewardMessage: "5 modules, 1 convention signée, 1 semaine complétée. La direction a été notifiée.",
  managerMessageWeek1:
    "Belle première semaine. On se voit pour ton check-in de 5 minutes avant ton prochain quart.",
};

export const DEMO_MODULES: DemoModule[] = [
  {
    id: "m1",
    title: "Les valeurs du studio",
    unlockDay: 1,
    estimatedMinutes: 10,
    sections: [
      { title: "Pourquoi ce studio existe", minutes: 3 },
      { title: "Les 5 valeurs de l'équipe", minutes: 4 },
      { title: "Quiz de validation", minutes: 3 },
    ],
  },
  { id: "m2", title: "RitmoKit — ton outil", unlockDay: 2, estimatedMinutes: 12 },
  { id: "m3", title: "Accueil & check-in", unlockDay: 3, estimatedMinutes: 7 },
  { id: "m4", title: "Salle & sécurité CNESST", unlockDay: 4, estimatedMinutes: 10 },
  { id: "m5", title: "Parité Lead / Follow", unlockDay: 5, estimatedMinutes: 8 },
];

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  {
    id: "sofia",
    fullName: "Sofia L.",
    initials: "SL",
    role: "Accueil",
    station: "Accueil",
    pin: "1234",
    trainingPercent: 80,
    status: "on_floor",
    hireDayOffset: 12,
  },
  {
    id: "karim",
    fullName: "Karim B.",
    initials: "KB",
    role: "Instructeur Bachata",
    station: "Instructeurs",
    pin: "2222",
    trainingPercent: 40,
    status: "late",
    hireDayOffset: 20,
  },
  {
    id: "maya",
    fullName: "Maya T.",
    initials: "MT",
    role: "Instructrice Salsa",
    station: "Instructeurs",
    pin: "3333",
    trainingPercent: 100,
    status: "on_floor",
    hireDayOffset: 8,
  },
  {
    id: "jonas",
    fullName: "Jonas R.",
    initials: "JR",
    role: "Entretien",
    station: "Entretien",
    pin: "4444",
    trainingPercent: 20,
    status: "onboarding_j1",
    hireDayOffset: 0,
  },
];

const DEMO_COACHING: DemoCoachingAction[] = [
  {
    employeeId: "karim",
    level: 1,
    priority: "high",
    body: "Retard de 22 min sans avertir. C'est la première occurrence.",
    script:
      'Dis-lui: "Ton absence sans avis a forcé l\'équipe à s\'ajuster. Qu\'est-ce qui s\'est passé?"',
    primaryCta: "Faire le coaching",
    secondaryCta: "Reporter",
    visibleFromDay: 2,
  },
  {
    employeeId: "sofia",
    level: 0,
    priority: "normal",
    body: "Check-in de fin de semaine 1 à compléter. Formation de base complétée — reconnaître publiquement en pré-shift.",
    script: "Reconnaître Sofia en pré-shift pour sa progression formation.",
    primaryCta: "Reconnaître",
    secondaryCta: "Planifier",
    visibleFromDay: 5,
  },
];

const DEMO_ALERTS: DemoAlert[] = [
  {
    id: "a1",
    tone: "danger",
    title: "Karim B. — retard sans avis",
    body: "22 min de retard. Coaching verbal requis. Niveau 0 → documenté dans RitmoKit automatiquement.",
    minutesAgo: 24,
    visibleFromDay: 2,
  },
  {
    id: "a2",
    tone: "success",
    title: "Maya T. — formation de base complétée",
    body: "5 modules complétés en 5 jours. À reconnaître en pré-shift aujourd'hui.",
    minutesAgo: 120,
    visibleFromDay: 5,
  },
  {
    id: "a3",
    tone: "success",
    title: "Jonas R. — convention signée",
    body: "Signature numérique confirmée. Module 1 démarré. Onboarding en cours.",
    minutesAgo: 180,
    visibleFromDay: 1,
  },
  {
    id: "a4",
    tone: "warn",
    title: "Couverture plancher — attention",
    body: "Retard Karim B. non couvert. Rush midi dans 18 min. Considère réassigner Sofia L. à l'assemblage.",
    minutesAgo: 24,
    visibleFromDay: 2,
  },
];

export type DemoJourneyScreen = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function clampDemoDay(day: number): number {
  return Math.min(5, Math.max(1, Math.round(day)));
}

export function moduleStatusForDay(
  module: DemoModule,
  day: number,
  completedThroughDay: number,
): DemoModuleStatus {
  if (module.unlockDay > day) return "locked";
  if (module.unlockDay < completedThroughDay || module.unlockDay < day) return "done";
  if (module.unlockDay === day) return "active";
  return "done";
}

/** For Maya-style 100%: all done. For Jonas: progress based on day. */
export function employeeModulesForDay(employeeId: string, day: number) {
  const emp = DEMO_EMPLOYEES.find((e) => e.id === employeeId);
  if (!emp) return [];

  if (emp.trainingPercent >= 100) {
    return DEMO_MODULES.map((m) => ({ ...m, status: "done" as DemoModuleStatus }));
  }

  const seniority = emp.id === "jonas" ? day : Math.min(5, Math.floor(emp.trainingPercent / 20));
  const effectiveDay = Math.max(1, seniority || 1);

  return DEMO_MODULES.map((m) => ({
    ...m,
    status: moduleStatusForDay(m, effectiveDay, effectiveDay),
  }));
}

export function getDemoTabletSnapshot(day: number) {
  const d = clampDemoDay(day);
  const onFloorCount = DEMO_EMPLOYEES.filter(
    (e) => e.status === "on_floor" || e.status === "late" || e.status === "onboarding_j1",
  ).length;

  const floorEmployees = DEMO_EMPLOYEES.map((e) => {
    let status = e.status;
    let trainingPercent = e.trainingPercent;
    if (e.id === "jonas") {
      status = d === 1 ? "onboarding_j1" : "on_floor";
      trainingPercent = Math.min(100, d * 20);
    }
    if (e.id === "karim" && d < 2) {
      status = "on_floor";
    }
    return { ...e, status, trainingPercent };
  });

  const formationsJ1 = floorEmployees.filter((e) => e.status === "onboarding_j1").length;
  const modulesCompleted = floorEmployees.reduce((acc, e) => acc + Math.floor(e.trainingPercent / 20), 0);

  const coaching = DEMO_COACHING.filter((c) => c.visibleFromDay <= d).map((c) => ({
    ...c,
    employee: DEMO_EMPLOYEES.find((e) => e.id === c.employeeId)!,
  }));

  const alerts = DEMO_ALERTS.filter((a) => a.visibleFromDay <= d);
  const activeAlerts = alerts.filter((a) => a.tone === "danger" || a.tone === "warn").length;

  const formations = floorEmployees.map((e) => ({
    employee: e,
    modules: employeeModulesForDay(
      e.id,
      e.id === "jonas" ? d : Math.max(1, Math.floor(e.trainingPercent / 20) || 1),
    ),
  }));

  return {
    day: d,
    brand: DEMO_BRAND,
    stats: {
      onFloor: onFloorCount,
      formationsJ1,
      modulesCompleted,
      activeAlerts,
    },
    floorEmployees,
    coaching,
    formations,
    alerts,
    coachingBanner:
      d >= 2
        ? "Karim B. — retard sans avis · Coaching verbal requis avant le prochain quart"
        : null,
  };
}

export function getDemoJourneyState(day: number, screen: DemoJourneyScreen) {
  const d = clampDemoDay(day);
  const modules = DEMO_MODULES.map((m) => ({
    ...m,
    status: moduleStatusForDay(m, d, d),
  }));

  return {
    day: d,
    screen,
    brand: DEMO_BRAND,
    modules,
    profileItems: [
      { id: "name", label: "Nom et prénom", desc: "Confirmé", done: true },
      { id: "phone", label: "Ton numéro", desc: "Pour les alertes de quart", done: true },
      { id: "nip", label: "Choisir ton NIP", desc: "Pour pointer sur la tablette", done: screen > 1 },
    ],
    conventionSigned: screen > 2,
    punchTime: "11:00",
    punchStation: "Caisse & Comptoir",
    module2Unlocked: d >= 2,
  };
}

export function resolveDemoPin(pin: string): DemoEmployee | null {
  return DEMO_EMPLOYEES.find((e) => e.pin === pin) ?? null;
}
