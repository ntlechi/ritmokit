/**
 * Insère les 5 valeurs studio si absentes (requis pour shout-outs + Culture card).
 * Usage : npx tsx scripts/seed-culture-values.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000010";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const cultureValues = [
  {
    valueKey: "VITESSE_SANS_CHAOS",
    sortOrder: 1,
    titleFr: "Énergie sans chaos",
    titleEn: "Energy without chaos",
    titleEs: "Energía sin caos",
    behaviorFr:
      "Tenir le rythme des cours sans jamais couper les coins ronds sur la sécurité CNESST.",
    behaviorEn: "Keep class pace without ever cutting corners on CNESST safety.",
    behaviorEs: "Mantener el ritmo de las clases sin recortar nunca la seguridad CNESST.",
  },
  {
    valueKey: "EQUIPE_DABORD",
    sortOrder: 2,
    titleFr: "L'équipe d'abord",
    titleEn: "Team first",
    titleEs: "El equipo primero",
    behaviorFr:
      "Prêter main-forte à la salle ou au poste voisin (ex. accueil) avant de fermer sa propre zone.",
    behaviorEn: "Help the neighboring room or desk (e.g. front desk) before closing your own zone.",
    behaviorEs: "Ayudar a la sala o puesto vecino (p. ej. recepción) antes de cerrar tu propia zona.",
  },
  {
    valueKey: "FIABILITE_1TAP",
    sortOrder: 3,
    titleFr: "Fiabilité 1-tap",
    titleEn: "1-tap reliability",
    titleEs: "Fiabilidad 1-tap",
    behaviorFr: "Ponctualité stricte au punch et communication immédiate 1-tap en cas de maladie.",
    behaviorEn: "Strict punch punctuality and immediate 1-tap communication when sick.",
    behaviorEs: "Puntualidad estricta al fichar y comunicación inmediata 1-tap en caso de enfermedad.",
  },
  {
    valueKey: "PROPRETE_SECURITE",
    sortOrder: 4,
    titleFr: "Propreté & sécurité",
    titleEn: "Cleanliness & safety",
    titleEs: "Limpieza y seguridad",
    behaviorFr:
      "Signaler immédiatement un risque, maintenir la salle propre, et ne jamais contourner une SOP sécurité.",
    behaviorEn: "Report risks immediately, keep the room clean, and never bypass a safety SOP.",
    behaviorEs: "Señalar riesgos de inmediato, mantener la sala limpia y nunca saltarse un SOP de seguridad.",
  },
  {
    valueKey: "RESPECT",
    sortOrder: 5,
    titleFr: "Respect",
    titleEn: "Respect",
    titleEs: "Respeto",
    behaviorFr:
      "Ton professionnel sous pression, feedback constructif, et inclusion de chaque membre de l'équipe.",
    behaviorEn:
      "Professional tone under pressure, constructive feedback, and inclusion of every teammate.",
    behaviorEs:
      "Tono profesional bajo presión, feedback constructivo e inclusión de cada compañero del equipo.",
  },
];

async function main() {
  for (const val of cultureValues) {
    await prisma.organizationValue.upsert({
      where: {
        organizationId_valueKey: { organizationId: DEMO_ORG_ID, valueKey: val.valueKey },
      },
      update: val,
      create: { organizationId: DEMO_ORG_ID, ...val, isActive: true },
    });
  }
  const count = await prisma.organizationValue.count({ where: { organizationId: DEMO_ORG_ID } });
  console.log(`✓ ${count} organization values for demo studio`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
