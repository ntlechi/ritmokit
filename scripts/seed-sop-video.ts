/**
 * Attache une vidéo YouTube de démonstration au premier module SÉCURITÉ actif
 * (vidéo OMS « Comment se laver les mains ») pour valider l'intégration vidéo.
 * Usage : npx tsx scripts/seed-sop-video.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DEMO_VIDEO_URL = "https://www.youtube.com/watch?v=3PmVJQUCm4E";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const result = await prisma.formationModule.updateMany({
    where: { isActive: true, kind: "SAFETY" },
    data: { videoUrl: DEMO_VIDEO_URL },
  });
  console.log(`✓ vidéo attachée à ${result.count} module(s) SAFETY`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
