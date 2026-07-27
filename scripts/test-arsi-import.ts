import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { importArsiPayload } from "../src/lib/arsi/import";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  ok — ${message}`);
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "bati" } });
  const manager = await prisma.user.findFirst({ where: { role: { in: ["MANAGER", "OWNER"] } } });
  const employee = await prisma.user.findFirst({ where: { role: "EMPLOYEE" } });
  if (!org || !manager || !employee) throw new Error("Seed data missing");

  const externalId = `test-arsi-latte-${Date.now()}`;

  console.log("[1] First import — create corporate Sop + FormationModule");
  const v1 = await importArsiPayload({
    userId: manager.id,
    payloadSize: 100,
    payload: {
      organizationId: org.id,
      sops: [
        {
          externalId,
          title: "Latte Test Arsi",
          kind: "RECIPE",
          stationSlug: "COMPTOIR",
          summary: "Test import",
          body: "# Latte Test\n\nProcédure de test Arsi Hub.",
          version: 1,
          isMandatory: true,
          estimatedMinutes: 4,
          steps: ["Étape A", "Étape B"],
        },
      ],
    },
  });
  assert(v1.createdCount === 1, "first import creates 1 module");
  assert(v1.updatedCount === 0, "first import updates 0 modules");

  const sop = await prisma.sop.findFirst({ where: { organizationId: org.id, arsiId: externalId } });
  assert(!!sop, "Sop persisted with arsiId");
  assert(sop!.scope === "CORPORATE", "Sop scope is CORPORATE");

  const module = await prisma.formationModule.findFirst({ where: { sopId: sop!.id } });
  assert(!!module, "FormationModule linked to Sop");
  assert(module!.scope === "CORPORATE", "FormationModule scope is CORPORATE");
  assert(module!.version === 1, "FormationModule version is 1");

  console.log("\n[2] Mark employee progress COMPLETED");
  await prisma.employeeFormationProgress.upsert({
    where: { userId_moduleId: { userId: employee.id, moduleId: module!.id } },
    create: {
      userId: employee.id,
      moduleId: module!.id,
      status: "COMPLETED",
      signatureName: employee.fullName,
      signedAt: new Date(),
      completedAt: new Date(),
    },
    update: {
      status: "COMPLETED",
      signatureName: employee.fullName,
      signedAt: new Date(),
      completedAt: new Date(),
    },
  });

  console.log("\n[3] Version bump v1 → v2 — update + invalidate");
  const v2 = await importArsiPayload({
    userId: manager.id,
    payloadSize: 100,
    payload: {
      organizationId: org.id,
      sops: [
        {
          externalId,
          title: "Latte Test Arsi v2",
          kind: "RECIPE",
          stationSlug: "COMPTOIR",
          summary: "Test import v2",
          body: "# Latte Test v2\n\nProcédure révisée.",
          version: 2,
          isMandatory: true,
          estimatedMinutes: 5,
          steps: ["Étape A révisée", "Étape B", "Étape C"],
        },
      ],
    },
  });
  assert(v2.updatedCount === 1, "second import updates 1 module");
  assert(v2.invalidatedCount === 1, "version bump invalidates 1 completed attestation");

  const progress = await prisma.employeeFormationProgress.findUnique({
    where: { userId_moduleId: { userId: employee.id, moduleId: module!.id } },
  });
  assert(progress?.status === "NOT_STARTED", "employee progress reset to NOT_STARTED");
  assert(progress?.completedAt === null, "completedAt cleared after invalidation");

  const refreshedModule = await prisma.formationModule.findUnique({ where: { id: module!.id } });
  assert(refreshedModule?.version === 2, "FormationModule version bumped to 2");
  assert(refreshedModule?.title === "Latte Test Arsi v2", "title updated from Arsi payload");

  console.log("\n[4] Idempotent re-import same version — no extra invalidation");
  const v2again = await importArsiPayload({
    userId: manager.id,
    payloadSize: 100,
    payload: {
      organizationId: org.id,
      sops: [
        {
          externalId,
          title: "Latte Test Arsi v2",
          kind: "RECIPE",
          stationSlug: "COMPTOIR",
          summary: "Test import v2",
          body: "# Latte Test v2\n\nProcédure révisée.",
          version: 2,
          isMandatory: true,
          estimatedMinutes: 5,
          steps: ["Étape A révisée", "Étape B", "Étape C"],
        },
      ],
    },
  });
  assert(v2again.invalidatedCount === 0, "same-version re-import invalidates nothing");

  console.log("\n✅ All Arsi Hub assertions passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
