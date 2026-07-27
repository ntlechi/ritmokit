import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PLATFORM_FLAGS,
  HYPOTHESIS_CATALOG,
  mergeFlagConfig,
  type ExperimentFlagConfig,
  type ExperimentHypothesisKey,
  type ExperimentTargetMetric,
  type HypothesisDefinition,
} from "@/lib/rsi/experiment-catalog";

export type ExperimentDashboardRow = {
  id: string;
  hypothesisKey: ExperimentHypothesisKey;
  description: string;
  targetMetric: string;
  status: string;
  startedAt: string | null;
  endsAt: string | null;
  avgMetricA: number | null;
  avgMetricB: number | null;
  liftRatio: number | null;
  liftThreshold: number;
  allocationCountA: number;
  allocationCountB: number;
  canStart: boolean;
  canConclude: boolean;
  canApply: boolean;
  canReject: boolean;
};

function pickDescription(def: HypothesisDefinition, lang: Locale): string {
  if (lang === "en") return def.descriptionEn;
  if (lang === "es") return def.descriptionEs;
  return def.descriptionFr;
}

function pickStoredDescription(
  row: { descriptionFr: string; descriptionEn: string; descriptionEs: string },
  lang: Locale,
): string {
  if (lang === "en") return row.descriptionEn;
  if (lang === "es") return row.descriptionEs;
  return row.descriptionFr;
}

/**
 * Résout les flags UX pour une succursale.
 * Priorité : allocation RUNNING → expérience APPLIED org → défauts plateforme.
 * Jamais de flags CNESST / paie.
 */
export async function resolveLocationExperimentFlags(
  locationId: string,
  organizationId: string,
): Promise<ExperimentFlagConfig> {
  const runningAlloc = await prisma.experimentAllocation.findFirst({
    where: {
      locationId,
      experiment: {
        organizationId,
        status: "RUNNING",
      },
    },
    include: {
      experiment: {
        select: {
          configVariantA: true,
          configVariantB: true,
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  if (runningAlloc) {
    const raw =
      runningAlloc.variant === "B"
        ? runningAlloc.experiment.configVariantB
        : runningAlloc.experiment.configVariantA;
    return mergeFlagConfig(raw);
  }

  const applied = await prisma.productExperiment.findFirst({
    where: { organizationId, status: "APPLIED" },
    orderBy: { decidedAt: "desc" },
  });
  if (applied) {
    return mergeFlagConfig(applied.configVariantB);
  }

  return { ...DEFAULT_PLATFORM_FLAGS };
}

async function measureShoutoutVolumePerLocation(
  locationIds: string[],
  startedAt: Date,
  endsAt: Date,
): Promise<number> {
  if (locationIds.length === 0) return 0;
  const count = await prisma.stationShoutOut.count({
    where: {
      locationId: { in: locationIds },
      createdAt: { gte: startedAt, lt: endsAt },
    },
  });
  return count / locationIds.length;
}

async function measureMetric(
  metric: ExperimentTargetMetric,
  locationIds: string[],
  startedAt: Date,
  endsAt: Date,
): Promise<number> {
  switch (metric) {
    case "SHOUTOUT_VOLUME":
      return measureShoutoutVolumePerLocation(locationIds, startedAt, endsAt);
    default:
      return 0;
  }
}

/**
 * Crée (ou récupère) un DRAFT pour l'hypothèse catalogue, sans démarrer.
 */
export async function ensureDraftExperiment(
  organizationId: string,
  hypothesisKey: ExperimentHypothesisKey,
) {
  const def = HYPOTHESIS_CATALOG[hypothesisKey];
  return prisma.productExperiment.upsert({
    where: {
      organizationId_hypothesisKey: { organizationId, hypothesisKey },
    },
    update: {},
    create: {
      organizationId,
      hypothesisKey,
      descriptionFr: def.descriptionFr,
      descriptionEn: def.descriptionEn,
      descriptionEs: def.descriptionEs,
      targetMetric: def.targetMetric,
      liftThreshold: def.liftThreshold,
      durationDays: def.durationDays,
      status: "DRAFT",
      configVariantA: def.configVariantA as unknown as Prisma.InputJsonValue,
      configVariantB: def.configVariantB as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Allocation déterministe 50/50 : locations actives triées par id, A/B alternés.
 * Une seule expérience RUNNING par organisation.
 */
export async function startExperiment(
  organizationId: string,
  hypothesisKey: ExperimentHypothesisKey,
): Promise<{ ok: true; experimentId: string } | { ok: false; error: string }> {
  const existingRunning = await prisma.productExperiment.findFirst({
    where: { organizationId, status: "RUNNING" },
  });
  if (existingRunning) return { ok: false, error: "already_running" };

  const draft = await ensureDraftExperiment(organizationId, hypothesisKey);
  if (draft.status !== "DRAFT" && draft.status !== "CONCLUDED_REJECTED") {
    return { ok: false, error: "invalid_status" };
  }

  const locations = await prisma.location.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (locations.length < 2) return { ok: false, error: "no_locations" };

  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + draft.durationDays);

  await prisma.$transaction(async (tx) => {
    await tx.experimentAllocation.deleteMany({ where: { experimentId: draft.id } });

    await tx.experimentAllocation.createMany({
      data: locations.map((loc, index) => ({
        experimentId: draft.id,
        locationId: loc.id,
        variant: index % 2 === 0 ? "A" : "B",
      })),
    });

    await tx.productExperiment.update({
      where: { id: draft.id },
      data: {
        status: "RUNNING",
        startedAt: now,
        endsAt,
        resultJson: { set: null },
        avgMetricA: null,
        avgMetricB: null,
        liftRatio: null,
        concludedAt: null,
        decidedById: null,
        decidedAt: null,
      },
    });
  });

  return { ok: true, experimentId: draft.id };
}

/**
 * Évalue une expérience RUNNING dont endsAt est passé.
 * CONCLUDED_APPLIED = B bat A d'au moins liftThreshold — signature humaine requise ensuite.
 * Ne déploie jamais automatiquement.
 */
export async function evaluateExperiment(
  experimentId: string,
): Promise<{ ok: true; status: string; liftRatio: number } | { ok: false; error: string }> {
  const exp = await prisma.productExperiment.findUnique({
    where: { id: experimentId },
    include: { allocations: true },
  });
  if (!exp) return { ok: false, error: "not_found" };
  if (exp.status !== "RUNNING") return { ok: false, error: "invalid_status" };
  if (!exp.startedAt || !exp.endsAt) return { ok: false, error: "missing_window" };
  if (exp.endsAt > new Date()) return { ok: false, error: "not_ended" };

  const groupA = exp.allocations.filter((a) => a.variant === "A").map((a) => a.locationId);
  const groupB = exp.allocations.filter((a) => a.variant === "B").map((a) => a.locationId);

  const metric = exp.targetMetric as ExperimentTargetMetric;
  const avgA = await measureMetric(metric, groupA, exp.startedAt, exp.endsAt);
  const avgB = await measureMetric(metric, groupB, exp.startedAt, exp.endsAt);

  const liftRatio = avgA <= 0 ? (avgB > 0 ? Number.POSITIVE_INFINITY : 0) : avgB / avgA - 1;
  const finiteLift = Number.isFinite(liftRatio) ? liftRatio : avgB > avgA ? 999 : 0;
  const qualifies = avgB > avgA * (1 + exp.liftThreshold);

  const status = qualifies ? "CONCLUDED_APPLIED" : "CONCLUDED_REJECTED";

  await prisma.productExperiment.update({
    where: { id: exp.id },
    data: {
      status,
      avgMetricA: avgA,
      avgMetricB: avgB,
      liftRatio: finiteLift,
      concludedAt: new Date(),
      resultJson: {
        metric,
        groupACount: groupA.length,
        groupBCount: groupB.length,
        avgA,
        avgB,
        liftRatio: finiteLift,
        liftThreshold: exp.liftThreshold,
        qualifies,
      } as Prisma.InputJsonValue,
    },
  });

  return { ok: true, status, liftRatio: finiteLift };
}

/** Clôture toutes les expériences RUNNING échues (appel Culture Health / cron). */
export async function evaluateDueExperiments(organizationId?: string): Promise<number> {
  const due = await prisma.productExperiment.findMany({
    where: {
      status: "RUNNING",
      endsAt: { lte: new Date() },
      ...(organizationId ? { organizationId } : {}),
    },
    select: { id: true },
  });

  let count = 0;
  for (const exp of due) {
    const result = await evaluateExperiment(exp.id);
    if (result.ok) count += 1;
  }
  return count;
}

/**
 * Signature humaine : déploie B globalement (status APPLIED).
 * Une seule APPLIED active par org pour la même hypothèse — les autres APPLIED du même key restent historiques via unique key.
 */
export async function applyExperimentWinner(
  experimentId: string,
  decidedById: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const exp = await prisma.productExperiment.findUnique({ where: { id: experimentId } });
  if (!exp) return { ok: false, error: "not_found" };
  if (exp.status !== "CONCLUDED_APPLIED") return { ok: false, error: "invalid_status" };

  await prisma.productExperiment.update({
    where: { id: experimentId },
    data: {
      status: "APPLIED",
      decidedById,
      decidedAt: new Date(),
    },
  });

  return { ok: true };
}

/** Signature humaine : refuse le déploiement même si B a gagné. */
export async function rejectExperimentWinner(
  experimentId: string,
  decidedById: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const exp = await prisma.productExperiment.findUnique({ where: { id: experimentId } });
  if (!exp) return { ok: false, error: "not_found" };
  if (exp.status !== "CONCLUDED_APPLIED" && exp.status !== "CONCLUDED_REJECTED") {
    return { ok: false, error: "invalid_status" };
  }

  await prisma.productExperiment.update({
    where: { id: experimentId },
    data: {
      status: "CONCLUDED_REJECTED",
      decidedById,
      decidedAt: new Date(),
    },
  });

  return { ok: true };
}

export async function getOrganizationExperiments(
  organizationId: string,
  lang: Locale,
): Promise<ExperimentDashboardRow[]> {
  await evaluateDueExperiments(organizationId);

  // Ensure catalog draft exists for first hypothesis (seed UX).
  await ensureDraftExperiment(organizationId, "CULTURE_CARD_ABOVE_BUDDY");

  const rows = await prisma.productExperiment.findMany({
    where: { organizationId },
    include: {
      allocations: { select: { variant: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const now = new Date();

  return rows.map((row) => {
    const def = HYPOTHESIS_CATALOG[row.hypothesisKey as ExperimentHypothesisKey];
    const description = def
      ? pickDescription(def, lang)
      : pickStoredDescription(row, lang);

    const allocationCountA = row.allocations.filter((a) => a.variant === "A").length;
    const allocationCountB = row.allocations.filter((a) => a.variant === "B").length;

    return {
      id: row.id,
      hypothesisKey: row.hypothesisKey as ExperimentHypothesisKey,
      description,
      targetMetric: row.targetMetric,
      status: row.status,
      startedAt: row.startedAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      avgMetricA: row.avgMetricA,
      avgMetricB: row.avgMetricB,
      liftRatio: row.liftRatio,
      liftThreshold: row.liftThreshold,
      allocationCountA,
      allocationCountB,
      canStart: row.status === "DRAFT" || row.status === "CONCLUDED_REJECTED",
      canConclude:
        row.status === "RUNNING" && row.endsAt != null && row.endsAt <= now,
      canApply: row.status === "CONCLUDED_APPLIED",
      canReject: row.status === "CONCLUDED_APPLIED",
    };
  });
}
