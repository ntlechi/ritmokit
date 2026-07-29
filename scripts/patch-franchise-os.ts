import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const orgId = "00000000-0000-0000-0000-000000000010";

async function main() {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      primaryColor: "#FF0013",
      welcomeCopy:
        "Ton application de travail. Horaires, formations, fiches de paie, et tout ce qu'il te faut pour réussir ici.",
    },
  });

  const mods = [
    { id: "00000000-0000-0000-0000-000000000205", title: "Les valeurs du studio", unlockDay: 1, sortOrder: 0, estimatedMinutes: 10 },
    { id: "00000000-0000-0000-0000-000000000206", title: "RitmoKit au quotidien", unlockDay: 2, sortOrder: 1, estimatedMinutes: 12 },
    { id: "00000000-0000-0000-0000-000000000207", title: "Accueil des élèves", unlockDay: 3, sortOrder: 2, estimatedMinutes: 7 },
    { id: "00000000-0000-0000-0000-000000000208", title: "Animation de cours", unlockDay: 4, sortOrder: 3, estimatedMinutes: 10 },
    { id: "00000000-0000-0000-0000-000000000209", title: "Propreté des salles", unlockDay: 5, sortOrder: 4, estimatedMinutes: 8 },
  ] as const;

  for (const m of mods) {
    await prisma.formationModule.upsert({
      where: { id: m.id },
      update: {
        title: m.title,
        unlockDay: m.unlockDay,
        sortOrder: m.sortOrder,
        estimatedMinutes: m.estimatedMinutes,
        kind: "ONBOARDING",
        isMandatory: true,
        isActive: true,
      },
      create: {
        id: m.id,
        organizationId: orgId,
        kind: "ONBOARDING",
        title: m.title,
        body: m.title,
        steps: [],
        unlockDay: m.unlockDay,
        sortOrder: m.sortOrder,
        estimatedMinutes: m.estimatedMinutes,
        isMandatory: true,
        requiresSignature: true,
      },
    });
  }

  // Sans affectation, un module reste invisible côté employé.
  const unassigned = await prisma.formationModule.findMany({
    where: { id: { in: mods.map((m) => m.id) }, assignments: { none: {} } },
    select: { id: true },
  });
  if (unassigned.length > 0) {
    await prisma.formationAssignment.createMany({
      data: unassigned.map((m) => ({ moduleId: m.id, audience: "EVERYONE" as const })),
    });
  }

  console.log("Brand + modules updated");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
