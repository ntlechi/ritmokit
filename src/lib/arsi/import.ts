import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  arsiImportPayloadSchema,
  normalizeArsiSteps,
  type ArsiImportPayload,
  type ArsiSopItem,
} from "@/lib/arsi/types";

export type ImportArsiInput = {
  userId: string;
  payload: ArsiImportPayload;
  payloadSize: number;
};

export type ImportArsiResult = {
  syncLogId: string;
  opsCount: number;
  createdCount: number;
  updatedCount: number;
  invalidatedCount: number;
};

function buildModulePayload(item: ArsiSopItem, organizationId: string, sopId: string) {
  const steps = normalizeArsiSteps(item.steps);

  return {
    organizationId,
    locationId: null,
    sopId,
    kind: item.kind,
    title: item.title.trim(),
    summary: item.summary?.trim() || null,
    body: item.body.trim(),
    steps: steps as Prisma.InputJsonValue,
    stationId: null,
    scope: "CORPORATE" as const,
    version: item.version,
    isMandatory: item.isMandatory,
    requiresSignature: item.isMandatory,
    estimatedMinutes: item.estimatedMinutes,
    isActive: true,
  };
}

function buildSopPayload(item: ArsiSopItem, organizationId: string) {
  const steps = normalizeArsiSteps(item.steps);

  return {
    organizationId,
    locationId: null,
    scope: "CORPORATE" as const,
    arsiId: item.externalId,
    title: item.title.trim(),
    body: item.body.trim(),
    steps: steps as Prisma.InputJsonValue,
    stationId: null,
    version: item.version,
    isActive: true,
  };
}

/**
 * Ingère un payload Arsi : upsert corporatif (Sop + FormationModule) et
 * invalide les attestations obligatoires si la version augmente.
 */
export async function importArsiPayload(input: ImportArsiInput): Promise<ImportArsiResult> {
  const parsed = arsiImportPayloadSchema.parse(input.payload);
  const { organizationId, sops } = parsed;

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw new Error("organization_not_found");

  let createdCount = 0;
  let updatedCount = 0;
  let invalidatedCount = 0;

  const result = await prisma.$transaction(async (tx) => {
    for (const item of sops) {
      if (item.kind !== "ONBOARDING" && !item.stationSlug) {
        throw new Error(`station_required:${item.externalId}`);
      }

      const existing = await tx.sop.findFirst({
        where: { organizationId, arsiId: item.externalId },
        include: { formationModule: true },
      });

      if (existing) {
        const versionBumped = item.version > existing.version;

        await tx.sop.update({
          where: { id: existing.id },
          data: buildSopPayload(item, organizationId),
        });

        let moduleId = existing.formationModule?.id;

        if (moduleId) {
          await tx.formationModule.update({
            where: { id: moduleId },
            data: buildModulePayload(item, organizationId, existing.id),
          });
        } else {
          const createdModule = await tx.formationModule.create({
            data: buildModulePayload(item, organizationId, existing.id),
          });
          moduleId = createdModule.id;
          await tx.formationAssignment.create({
            data: { moduleId, audience: "EVERYONE" },
          });
        }

        if (versionBumped && item.isMandatory && moduleId) {
          const reset = await tx.employeeFormationProgress.updateMany({
            where: { moduleId, status: "COMPLETED" },
            data: {
              status: "NOT_STARTED",
              signatureName: null,
              signedAt: null,
              ipAddress: null,
              completedAt: null,
            },
          });
          invalidatedCount += reset.count;
        }

        updatedCount++;
      } else {
        const sop = await tx.sop.create({
          data: buildSopPayload(item, organizationId),
        });
        const createdModule = await tx.formationModule.create({
          data: buildModulePayload(item, organizationId, sop.id),
        });
        // Un module corporatif s'adresse à toute la franchise par défaut ;
        // sans cette règle il resterait invisible (voir resolveVisibility).
        await tx.formationAssignment.create({
          data: { moduleId: createdModule.id, audience: "EVERYONE" },
        });
        createdCount++;
      }
    }

    const syncLog = await tx.arsiSyncLog.create({
      data: {
        organizationId,
        importedById: input.userId,
        payloadSize: input.payloadSize,
        opsCount: sops.length,
        createdCount,
        updatedCount,
        invalidatedCount,
      },
    });

    return syncLog;
  });

  return {
    syncLogId: result.id,
    opsCount: sops.length,
    createdCount,
    updatedCount,
    invalidatedCount,
  };
}
