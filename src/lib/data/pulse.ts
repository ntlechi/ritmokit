import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import { getPulseWeekBounds, getPulseWeekParts } from "@/lib/pulse/week";

export type PulsePrompt = {
  questionId: string;
  locationId: string;
  stationId: string;
  weekNumber: number;
  year: number;
  text: string;
};

export type PulseStationSnapshot = {
  stationId: string;
  stationNameFr: string;
  stationNameEn: string;
  stationNameEs: string;
  average: number;
  count: number;
};

export type PulseWeekSnapshot = {
  weekNumber: number;
  year: number;
  questionText: string | null;
  overallAverage: number | null;
  responseCount: number;
  byStation: PulseStationSnapshot[];
};

function pickQuestionText(
  q: { textFr: string; textEn: string; textEs: string },
  lang: Locale,
): string {
  if (lang === "en") return q.textEn;
  if (lang === "es") return q.textEs;
  return q.textFr;
}

/**
 * Banque de secours (rotation modulo 8) si aucune PulseQuestion n'est seedée
 * pour la semaine ISO courante. Chaque question est taguée à une valeur studio.
 */
const FALLBACK_BANK: Array<{
  textFr: string;
  textEn: string;
  textEs: string;
  valueKey: string;
}> = [
  {
    valueKey: "VITESSE_SANS_CHAOS",
    textFr: "Comment te sens-tu après ton quart aujourd'hui ?",
    textEn: "How do you feel after your shift today?",
    textEs: "¿Cómo te sientes después de tu turno de hoy?",
  },
  {
    valueKey: "VITESSE_SANS_CHAOS",
    textFr: "Le rythme de ta station était-il gérable cette semaine ?",
    textEn: "Was your station's pace manageable this week?",
    textEs: "¿El ritmo de tu estación fue manejable esta semana?",
  },
  {
    valueKey: "EQUIPE_DABORD",
    textFr: "Te sens-tu soutenu·e par ton équipe sur le plancher ?",
    textEn: "Do you feel supported by your team on the floor?",
    textEs: "¿Te sientes apoyado/a por tu equipo en el piso?",
  },
  {
    valueKey: "FIABILITE_1TAP",
    textFr: "Les outils (POS, prep, coms) t'ont-ils aidé·e cette semaine ?",
    textEn: "Did tools (POS, prep, comms) help you this week?",
    textEs: "¿Las herramientas (POS, prep, coms) te ayudaron esta semana?",
  },
  {
    valueKey: "EQUIPE_DABORD",
    textFr: "Recommanderais-tu de travailler ici à un ami cette semaine ?",
    textEn: "Would you recommend working here to a friend this week?",
    textEs: "¿Recomendarías trabajar aquí a un amigo esta semana?",
  },
  {
    valueKey: "RESPECT",
    textFr: "La communication avec la gestion a-t-elle été claire ?",
    textEn: "Was communication with management clear?",
    textEs: "¿Fue clara la comunicación con la gerencia?",
  },
  {
    valueKey: "PROPRETE_SECURITE",
    textFr: "As-tu eu le temps de faire ton travail correctement ?",
    textEn: "Did you have enough time to do your job properly?",
    textEs: "¿Tuviste tiempo suficiente para hacer bien tu trabajo?",
  },
  {
    valueKey: "EQUIPE_DABORD",
    textFr: "Le moral de ta station est-il bon en ce moment ?",
    textEn: "Is your station's morale good right now?",
    textEs: "¿Está bien la moral de tu estación en este momento?",
  },
];

async function ensureWeeklyQuestion(organizationId: string, weekNumber: number, year: number) {
  const existing = await prisma.pulseQuestion.findUnique({
    where: {
      organizationId_weekNumber_year: { organizationId, weekNumber, year },
    },
  });
  if (existing) return existing;

  const bank = FALLBACK_BANK[(weekNumber - 1) % FALLBACK_BANK.length]!;
  return prisma.pulseQuestion.create({
    data: {
      organizationId,
      weekNumber,
      year,
      textFr: bank.textFr,
      textEn: bank.textEn,
      textEs: bank.textEs,
      valueKey: bank.valueKey,
      isActive: true,
    },
  });
}

/**
 * Prompt Pulse au punch-out : uniquement au premier clock-out réussi de la
 * semaine ISO, et si aucun reçu d'idempotence n'existe encore.
 */
export async function getPulsePromptForUser(
  userId: string,
  lang: Locale,
): Promise<PulsePrompt | null> {
  const { weekNumber, year } = getPulseWeekParts();
  const { start, end } = getPulseWeekBounds();

  const receipt = await prisma.pulseReceipt.findUnique({
    where: {
      userId_year_weekNumber: { userId, year, weekNumber },
    },
  });
  if (receipt) return null;

  const priorClockOuts = await prisma.shift.count({
    where: {
      employeeId: userId,
      actualEndsAt: { gte: start, lt: end },
    },
  });
  // Éligible dès le premier clock-out de la semaine ISO, jusqu'à réponse/skip.
  if (priorClockOuts < 1) return null;

  const latest = await prisma.shift.findFirst({
    where: {
      employeeId: userId,
      actualEndsAt: { gte: start, lt: end },
    },
    orderBy: { actualEndsAt: "desc" },
    select: {
      locationId: true,
      stationId: true,
      location: { select: { organizationId: true } },
    },
  });
  if (!latest) return null;

  const question = await ensureWeeklyQuestion(
    latest.location.organizationId,
    weekNumber,
    year,
  );
  if (!question.isActive) return null;

  return {
    questionId: question.id,
    locationId: latest.locationId,
    stationId: latest.stationId,
    weekNumber,
    year,
    text: pickQuestionText(question, lang),
  };
}

/** Snapshot agrégé (anonyme) pour le tableau gérant — semaine courante. */
export async function getPulseSnapshotForManager(
  userId: string,
  _role: string,
  lang: Locale,
): Promise<PulseWeekSnapshot | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: { select: { id: true, organizationId: true } } },
  });
  // Fail closed — never fall back to an arbitrary active location.
  if (!membership?.locationId) return null;

  const locationId = membership.locationId;
  const organizationId = membership.location.organizationId;
  if (!organizationId) return null;

  const { weekNumber, year } = getPulseWeekParts();
  const question = await prisma.pulseQuestion.findUnique({
    where: {
      organizationId_weekNumber_year: { organizationId, weekNumber, year },
    },
  });

  const [rows, stationRows] = await Promise.all([
    prisma.pulseResponse.groupBy({
      by: ["stationId"],
      where: { locationId, year, weekNumber },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.station.findMany({
      where: { locationId },
      select: { id: true, nameFr: true, nameEn: true, nameEs: true },
    }),
  ]);

  const stationById = new Map(stationRows.map((s) => [s.id, s]));

  // Suppress per-station breakdown below anonymity floor; keep overall from all responses.
  const PULSE_ANONYMITY_FLOOR = 3;
  const stationSnapshots: PulseStationSnapshot[] = rows.map((row) => {
    const station = stationById.get(row.stationId);
    const count = row._count?._all ?? 0;
    return {
      stationId: row.stationId,
      stationNameFr: station?.nameFr ?? row.stationId,
      stationNameEn: station?.nameEn ?? row.stationId,
      stationNameEs: station?.nameEs ?? row.stationId,
      average: Math.round((row._avg?.score ?? 0) * 10) / 10,
      count,
    };
  });

  const responseCount = stationSnapshots.reduce((sum, s) => sum + s.count, 0);
  const overallAverage =
    responseCount === 0
      ? null
      : Math.round(
          (stationSnapshots.reduce((sum, s) => sum + s.average * s.count, 0) / responseCount) * 10,
        ) / 10;

  const byStation = stationSnapshots
    .filter((row) => row.count >= PULSE_ANONYMITY_FLOOR)
    .sort((a, b) => a.stationNameFr.localeCompare(b.stationNameFr));

  return {
    weekNumber,
    year,
    questionText: question ? pickQuestionText(question, lang) : null,
    overallAverage,
    responseCount,
    byStation,
  };
}
