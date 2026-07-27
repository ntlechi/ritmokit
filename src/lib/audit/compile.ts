import "server-only";

import { createHash } from "crypto";
import type { AuditType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { asPlainNumber } from "@/lib/data/serialize";
import { getTorontoDayBounds } from "@/lib/finance/tips";
import { canonicalStringify } from "@/lib/audit/canonical-json";
import { buildZip, type ZipEntry } from "@/lib/audit/zip";

const SCHEDULED_SHIFT_STATUSES = ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED", "CRISIS_ALERT"] as const;
/// Kinds de formation considérés comme preuve d'hygiène/salubrité MAPAQ —
/// SAFETY couvre les modules spécifiques par station, ONBOARDING couvre le
/// tronc commun (ex. hygiène générale) posé à l'embauche.
const MAPAQ_RELEVANT_KINDS = ["SAFETY", "ONBOARDING"] as const;

export type CompileAuditInput = {
  locationId: string;
  userId: string;
  type: AuditType;
  startDate: Date;
  endDate: Date;
};

export type CompiledAuditPackage = {
  fileName: string;
  zipBuffer: Buffer;
  manifestHash: string;
  recordCount: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compile un dossier d'audit scellé pour une succursale et une portée
 * réglementaire donnée (CNESST, MAPAQ, Fiscal, ou complet). Le manifeste
 * JSON est déterministe (clés triées) et son hash SHA-256 constitue la
 * preuve d'intégrité remise à l'inspecteur. Le ZIP produit (manifeste +
 * sommaire lisible + certificat d'intégrité) est ensuite stocké tel quel
 * dans `AuditPackageLog.packageData` — jamais régénéré à la demande.
 */
export async function compileAuditPackage(input: CompileAuditInput): Promise<CompiledAuditPackage> {
  const { locationId, userId, type } = input;

  const location = await prisma.location.findUniqueOrThrow({
    where: { id: locationId },
    select: { id: true, name: true, slug: true, organizationId: true },
  });

  const { dayStart: periodStart } = getTorontoDayBounds(input.startDate);
  const { dayEnd: periodEnd } = getTorontoDayBounds(input.endDate);

  const manifest: Record<string, unknown> = {
    metadata: {
      platform: "Mirok.ca — QSR Operating System",
      generatedAt: new Date().toISOString(),
      generatedByUserId: userId,
      locationId,
      locationName: location.name,
      scope: type,
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    },
    evidence: {} as Record<string, unknown>,
  };
  const evidence = manifest.evidence as Record<string, unknown>;

  let recordCount = 0;

  if (type === "CNESST" || type === "FULL") {
    const cnesst = await compileCnesstEvidence(locationId, periodStart, periodEnd);
    evidence.cnesst_roster_signatures = cnesst.rosterSignatures;
    evidence.cnesst_shift_punches = cnesst.shiftPunches;
    evidence.cnesst_break_violations = cnesst.breakViolations;
    recordCount += cnesst.rosterSignatures.length + cnesst.shiftPunches.length + cnesst.breakViolations.length;
  }

  if (type === "MAPAQ" || type === "FULL") {
    const mapaq = await compileMapaqEvidence(locationId, location.organizationId);
    evidence.mapaq_training_compliance = mapaq.trainingCompliance;
    recordCount += mapaq.trainingCompliance.length;
  }

  if (type === "FISCAL" || type === "FULL") {
    const fiscal = await compileFiscalEvidence(locationId, periodStart, periodEnd);
    evidence.fiscal_tip_pool_agreement = fiscal.tipPoolAgreement;
    evidence.fiscal_tip_votes = fiscal.tipVotes;
    evidence.fiscal_tip_distributions = fiscal.tipDistributions;
    evidence.fiscal_pos_sales_hourly = fiscal.posSalesHourly;
    evidence.fiscal_pay_periods = fiscal.payPeriods;
    evidence.fiscal_payroll_exports = fiscal.payrollExports;
    recordCount +=
      fiscal.tipVotes.length +
      fiscal.tipDistributions.length +
      fiscal.posSalesHourly.length +
      fiscal.payPeriods.length +
      fiscal.payrollExports.length;
  }

  manifest.metadata = { ...(manifest.metadata as object), recordCount };

  const manifestJson = canonicalStringify(manifest);
  const manifestHash = createHash("sha256").update(manifestJson, "utf8").digest("hex");

  const startLabel = periodStart.toISOString().slice(0, 10);
  const endLabel = new Date(periodEnd.getTime() - 1).toISOString().slice(0, 10);
  const fileName = `mirok-audit-${type.toLowerCase()}-${location.slug}-${startLabel}-to-${endLabel}.zip`;

  const summaryText = buildHumanReadableSummary(manifest, manifestHash, recordCount, fileName);
  const integrityText = buildIntegrityCertificate(manifestHash, manifestJson);

  const entries: ZipEntry[] = [
    { name: "manifest.json", content: manifestJson },
    { name: "SOMMAIRE.txt", content: summaryText },
    { name: "SCEAU_INTEGRITE.txt", content: integrityText },
  ];

  const zipBuffer = buildZip(entries);

  return { fileName, zipBuffer, manifestHash, recordCount };
}

async function compileCnesstEvidence(locationId: string, periodStart: Date, periodEnd: Date) {
  // Mirok ne conserve pas d'historique des dates de mouvement d'effectif —
  // le rapport de conformité RH reflète donc le roster actif au moment de
  // la génération, quelle que soit la période sélectionnée pour les
  // preuves transactionnelles (pointages, violations de pause).
  const [members, shifts, breakViolationLogs] = await Promise.all([
    prisma.locationMember.findMany({
      where: { locationId },
      include: { user: { include: { hrProfile: true } }, station: { select: { nameFr: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.shift.findMany({
      where: {
        locationId,
        employeeId: { not: null },
        status: { in: [...SCHEDULED_SHIFT_STATUSES] },
        startsAt: { gte: periodStart, lt: periodEnd },
      },
      include: { employee: { select: { fullName: true, email: true } }, station: { select: { nameFr: true } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.agentLog.findMany({
      where: {
        channel: "agent:cnesst",
        eventType: "shift.break_violation_detected",
        relatedShift: { locationId },
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rosterSignatures = members.map((member) => ({
    employee: member.user.fullName,
    email: member.user.email,
    stationId: member.stationId,
    stationNameFr: member.station?.nameFr ?? null,
    hiredAt: member.hiredAt?.toISOString() ?? null,
    onboardingStatus: member.user.hrProfile?.onboardingStatus ?? "NOT_STARTED",
    hasSignedHandbook: member.user.hrProfile?.hasSignedHandbook ?? false,
    handbookSignatureName: member.user.hrProfile?.handbookSignatureName ?? null,
    handbookSignedAt: member.user.hrProfile?.handbookSignedAt?.toISOString() ?? null,
    handbookIpAddress: member.user.hrProfile?.handbookIpAddress ?? null,
  }));

  const shiftPunches = shifts.map((shift) => ({
    employee: shift.employee?.fullName ?? null,
    email: shift.employee?.email ?? null,
    stationId: shift.stationId,
    stationNameFr: shift.station.nameFr,
    plannedStartsAt: shift.startsAt.toISOString(),
    plannedEndsAt: shift.endsAt.toISOString(),
    actualStartsAt: shift.actualStartsAt?.toISOString() ?? null,
    actualEndsAt: shift.actualEndsAt?.toISOString() ?? null,
    isPunched: !!(shift.actualStartsAt && shift.actualEndsAt),
    breakRequiredMinutes: shift.breakRequiredMinutes,
    breakStartedAt: shift.breakStartedAt?.toISOString() ?? null,
    breakEndedAt: shift.breakEndedAt?.toISOString() ?? null,
    weeklyHoursSnapshot: asPlainNumber(shift.weeklyHoursSnapshot),
    overtimeFlag: shift.overtimeFlag,
    restViolationFlag: shift.restViolationFlag,
  }));

  const breakViolations = breakViolationLogs.map((log) => {
    const payload = (log.payload ?? {}) as Record<string, unknown>;
    return {
      shiftId: log.relatedShiftId,
      detectedAt: log.createdAt.toISOString(),
      policyViolation: payload.policyViolation ?? null,
      severity: payload.severity ?? null,
      breakTakenMinutes: payload.breakTakenMinutes ?? null,
      breakRequiredMinutes: payload.breakRequiredMinutes ?? null,
      actionTaken: payload.actionTaken ?? null,
    };
  });

  return { rosterSignatures, shiftPunches, breakViolations };
}

async function compileMapaqEvidence(locationId: string, organizationId: string) {
  const members = await prisma.locationMember.findMany({
    where: { locationId },
    include: { user: { select: { id: true, fullName: true } }, station: { select: { nameFr: true } } },
    orderBy: { user: { fullName: "asc" } },
  });

  const modules = await prisma.formationModule.findMany({
    where: {
      isActive: true,
      kind: { in: [...MAPAQ_RELEVANT_KINDS] },
      OR: [{ locationId }, { locationId: null, organizationId }, { locationId: null, organizationId: null }],
    },
    select: { id: true, title: true, stationId: true, kind: true, isMandatory: true },
  });

  if (modules.length === 0 || members.length === 0) {
    return { trainingCompliance: [] as Record<string, unknown>[] };
  }

  const progress = await prisma.employeeFormationProgress.findMany({
    where: {
      userId: { in: members.map((m) => m.user.id) },
      moduleId: { in: modules.map((m) => m.id) },
    },
  });

  const progressByKey = new Map(progress.map((p) => [`${p.userId}:${p.moduleId}`, p]));

  const trainingCompliance: Record<string, unknown>[] = [];
  for (const member of members) {
    for (const formationModule of modules) {
      // Un module lié à une station spécifique ne concerne que les employés
      // de cette station — le tronc commun (station null) s'applique à tous.
      if (formationModule.stationId != null && formationModule.stationId !== member.stationId) continue;

      const record = progressByKey.get(`${member.user.id}:${formationModule.id}`);
      trainingCompliance.push({
        employee: member.user.fullName,
        stationId: member.stationId,
        stationNameFr: member.station?.nameFr ?? null,
        moduleTitle: formationModule.title,
        moduleKind: formationModule.kind,
        isMandatory: formationModule.isMandatory,
        status: record?.status ?? "NOT_STARTED",
        signatureName: record?.signatureName ?? null,
        signedAt: record?.signedAt?.toISOString() ?? null,
        ipAddress: record?.ipAddress ?? null,
        completedAt: record?.completedAt?.toISOString() ?? null,
      });
    }
  }

  // Tri stable pour un manifeste lisible et déterministe.
  trainingCompliance.sort((a, b) => {
    const employeeCompare = String(a.employee).localeCompare(String(b.employee), "fr-CA");
    if (employeeCompare !== 0) return employeeCompare;
    return String(a.moduleTitle).localeCompare(String(b.moduleTitle), "fr-CA");
  });

  return { trainingCompliance };
}

async function compileFiscalEvidence(locationId: string, periodStart: Date, periodEnd: Date) {
  const distributionStart = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), periodStart.getUTCDate()),
  );
  const distributionEndExclusive = new Date(
    Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate()),
  );

  const [config, votes, distributions, posSales, payPeriods, stations] = await Promise.all([
    prisma.tipPoolConfig.findUnique({ where: { locationId } }),
    prisma.tipPoolVote.findMany({
      where: { config: { locationId }, signedAt: { gte: periodStart, lt: periodEnd } },
      include: { user: { select: { fullName: true } } },
      orderBy: { signedAt: "asc" },
    }),
    prisma.tipDistribution.findMany({
      where: { locationId, distributionDate: { gte: distributionStart, lt: distributionEndExclusive } },
      include: { distributedBy: { select: { fullName: true } } },
      orderBy: { distributionDate: "asc" },
    }),
    prisma.posSalesHourly.findMany({
      where: { locationId, date: { gte: distributionStart, lt: distributionEndExclusive } },
      orderBy: [{ date: "asc" }, { hour: "asc" }],
    }),
    prisma.payPeriod.findMany({
      where: {
        locationId,
        status: "LOCKED",
        startDate: { lt: distributionEndExclusive },
        endDate: { gt: distributionStart },
      },
      include: {
        lockedBy: { select: { fullName: true } },
        lineItems: { select: { grossPay: true } },
        exports: { include: { exportedBy: { select: { fullName: true } } } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.station.findMany({
      where: { locationId, isActive: true },
      select: { id: true, nameFr: true, tipPoints: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const tipPoolAgreement = config
    ? {
        isActive: config.isActive,
        status: config.status,
        votedAt: config.votedAt?.toISOString() ?? null,
        stationTipPoints: stations.map((s) => ({
          stationId: s.id,
          nameFr: s.nameFr,
          tipPoints: asPlainNumber(s.tipPoints),
        })),
        agreementText: config.agreementText,
      }
    : null;

  const tipVotes = votes.map((vote) => ({
    employee: vote.user.fullName,
    isApproved: vote.isApproved,
    signatureName: vote.signatureName,
    signedAt: vote.signedAt.toISOString(),
    ipAddress: vote.ipAddress,
  }));

  const tipDistributions = distributions.map((d) => ({
    distributionDate: d.distributionDate.toISOString().slice(0, 10),
    totalTipsCollected: asPlainNumber(d.totalTipsCollected),
    totalWeightedHours: asPlainNumber(d.totalWeightedHours),
    valuePerPoint: asPlainNumber(d.valuePerPoint),
    distributedBy: d.distributedBy.fullName,
    distributedAt: d.distributedAt.toISOString(),
  }));

  const posSalesHourly = posSales.map((s) => ({
    date: s.date.toISOString().slice(0, 10),
    hour: s.hour,
    netSales: asPlainNumber(s.netSales),
    tipsCollected: asPlainNumber(s.tipsCollected),
  }));

  const payPeriodsEvidence = payPeriods.map((p) => ({
    startDate: p.startDate.toISOString().slice(0, 10),
    endDate: p.endDate.toISOString().slice(0, 10),
    lockedAt: p.lockedAt?.toISOString() ?? null,
    lockedBy: p.lockedBy?.fullName ?? null,
    lineItemCount: p.lineItems.length,
    totalGrossPay: round2(p.lineItems.reduce((sum, li) => sum + asPlainNumber(li.grossPay), 0)),
  }));

  const payrollExports = payPeriods.flatMap((p) =>
    p.exports.map((exp) => ({
      payPeriodStart: p.startDate.toISOString().slice(0, 10),
      payPeriodEnd: p.endDate.toISOString().slice(0, 10),
      format: exp.format,
      fileName: exp.fileName,
      lineItemCount: exp.lineItemCount,
      exportedAt: exp.exportedAt.toISOString(),
      exportedBy: exp.exportedBy.fullName,
    })),
  );

  return {
    tipPoolAgreement,
    tipVotes,
    tipDistributions,
    posSalesHourly,
    payPeriods: payPeriodsEvidence,
    payrollExports,
  };
}

function buildHumanReadableSummary(
  manifest: Record<string, unknown>,
  hash: string,
  recordCount: number,
  fileName: string,
): string {
  const metadata = manifest.metadata as Record<string, unknown>;
  const lines = [
    "MIROK.CA — DOSSIER D'AUDIT SCELLÉ",
    "===================================",
    "",
    `Fichier : ${fileName}`,
    `Succursale : ${metadata.locationName}`,
    `Portée réglementaire : ${metadata.scope}`,
    `Période couverte : ${metadata.period ? (metadata.period as { start: string }).start : "—"} → ${
      metadata.period ? (metadata.period as { end: string }).end : "—"
    }`,
    `Généré le : ${metadata.generatedAt}`,
    `Nombre total de preuves compilées : ${recordCount}`,
    "",
    "Ce dossier contient :",
    "  - manifest.json      → l'ensemble structuré des preuves numériques (source de vérité)",
    "  - SCEAU_INTEGRITE.txt → le hash SHA-256 du manifeste, pour vérification indépendante",
    "",
    "Pour vérifier l'intégrité du manifeste, calculez son hash SHA-256 et",
    "comparez-le à la valeur inscrite dans SCEAU_INTEGRITE.txt :",
    "",
    `  SHA-256(manifest.json) = ${hash}`,
    "",
    "Toute divergence indique une altération du fichier après sa génération.",
  ];
  return lines.join("\r\n") + "\r\n";
}

function buildIntegrityCertificate(hash: string, manifestJson: string): string {
  const byteLength = Buffer.byteLength(manifestJson, "utf8");
  return (
    [
      "CERTIFICAT D'INTÉGRITÉ — MIROK.CA",
      "==================================",
      "",
      "Algorithme de hachage : SHA-256",
      `Empreinte du manifeste (manifest.json) : ${hash}`,
      `Taille du manifeste (octets, UTF-8) : ${byteLength}`,
      "",
      "Ce certificat atteste que le fichier manifest.json inclus dans ce",
      "dossier correspond exactement, au bit près, à l'état des données au",
      "moment de la génération. Toute modification ultérieure du contenu de",
      "manifest.json produira une empreinte SHA-256 différente.",
    ].join("\r\n") + "\r\n"
  );
}
