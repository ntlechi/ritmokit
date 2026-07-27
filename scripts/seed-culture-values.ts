/**
 * Insère les 5 valeurs Bati si absentes (requis pour shout-outs + Culture card).
 * Usage : npx tsx scripts/seed-culture-values.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const BATI_ORG_ID = "00000000-0000-0000-0000-000000000010";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const cultureValues = [
  {
    valueKey: "VITESSE_SANS_CHAOS",
    sortOrder: 1,
    titleFr: "Vitesse sans chaos",
    titleEn: "Speed without chaos",
    titleEs: "Velocidad sin caos",
    behaviorFr:
      "Prioriser la cadence client sans jamais couper les coins ronds sur la sécurité CNESST.",
    behaviorEn: "Prioritize guest pace without ever cutting corners on CNESST safety.",
    behaviorEs: "Priorizar el ritmo del cliente sin recortar nunca la seguridad CNESST.",
  },
  {
    valueKey: "EQUIPE_DABORD",
    sortOrder: 2,
    titleFr: "L'équipe d'abord",
    titleEn: "Team first",
    titleEs: "El equipo primero",
    behaviorFr:
      "Prêter main-forte à la station voisine (ex. Emballage) avant de fermer sa propre zone au Comptoir.",
    behaviorEn: "Help the neighboring station (e.g. Packaging) before closing your own Counter zone.",
    behaviorEs: "Ayudar a la estación vecina (p. ej. Empaque) antes de cerrar tu propia zona de Mostrador.",
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
      "Signaler immédiatement un risque, maintenir la station propre, et ne jamais contourner une SOP sécurité.",
    behaviorEn: "Report risks immediately, keep the station clean, and never bypass a safety SOP.",
    behaviorEs: "Señalar riesgos de inmediato, mantener la estación limpia y nunca saltarse un SOP de seguridad.",
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

async function main() {
  for (const val of cultureValues) {
    await prisma.organizationValue.upsert({
      where: {
        organizationId_valueKey: { organizationId: BATI_ORG_ID, valueKey: val.valueKey },
      },
      update: val,
      create: { organizationId: BATI_ORG_ID, ...val, isActive: true },
    });
  }
  const count = await prisma.organizationValue.count({ where: { organizationId: BATI_ORG_ID } });
  console.log(`✓ ${count} organization values for Bati`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
