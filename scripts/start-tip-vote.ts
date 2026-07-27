/**
 * Démarre un vote pourboires (statut VOTING) avec le texte FR par défaut.
 * Usage : npx tsx scripts/start-tip-vote.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getDefaultTipAgreementText } from "../src/lib/tips/agreement-template";

const LOCATION_ID = "00000000-0000-0000-0000-000000000011";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const agreementText = getDefaultTipAgreementText("fr");
  const config = await prisma.tipPoolConfig.upsert({
    where: { locationId: LOCATION_ID },
    update: {
      status: "VOTING",
      agreementText,
      isActive: false,
      votedAt: null,
    },
    create: {
      locationId: LOCATION_ID,
      status: "VOTING",
      agreementText,
      isActive: false,
    },
  });
  await prisma.tipPoolVote.deleteMany({ where: { configId: config.id } });
  console.log(`✓ tip vote started (config ${config.id}, status VOTING)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
