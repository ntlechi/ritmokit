import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AutopilotLoopKind, AutopilotLoopOutcome } from "@/generated/prisma/enums";
import type { AgentPlaybookName } from "@/lib/rsi/playbooks";
import { prisma } from "@/lib/prisma";

export type PlaybookCandidate = {
  agentName: AgentPlaybookName;
  fingerprint: string;
  currentConfig: Record<string, unknown>;
  proposedConfig: Record<string, unknown>;
  evidence: Record<string, unknown>;
  rationaleFr: string;
  rationaleEn: string;
  rationaleEs: string;
  /** Drift-guard veto — still recorded as a DRIFT_GUARD run, proposal not auto-applied. */
  guardrailHold?: boolean;
};

export function weekFingerprint(prefix: string, year: number, weekNumber: number, suffix: string) {
  return `${prefix}:${year}-W${weekNumber}:${suffix}`;
}

export async function recordLoopRun(input: {
  locationId: string;
  loopKind: AutopilotLoopKind;
  year: number;
  weekNumber: number;
  metricName: string;
  metricValue?: number | null;
  targetValue?: number | null;
  deltaValue?: number | null;
  outcome: AutopilotLoopOutcome;
  evidence: Record<string, unknown>;
}) {
  await prisma.autopilotLoopRun.upsert({
    where: {
      locationId_loopKind_year_weekNumber: {
        locationId: input.locationId,
        loopKind: input.loopKind,
        year: input.year,
        weekNumber: input.weekNumber,
      },
    },
    update: {
      metricName: input.metricName,
      metricValue: input.metricValue ?? null,
      targetValue: input.targetValue ?? null,
      deltaValue: input.deltaValue ?? null,
      outcome: input.outcome,
      evidence: input.evidence as Prisma.InputJsonValue,
    },
    create: {
      locationId: input.locationId,
      loopKind: input.loopKind,
      year: input.year,
      weekNumber: input.weekNumber,
      metricName: input.metricName,
      metricValue: input.metricValue ?? null,
      targetValue: input.targetValue ?? null,
      deltaValue: input.deltaValue ?? null,
      outcome: input.outcome,
      evidence: input.evidence as Prisma.InputJsonValue,
    },
  });
}

export async function upsertPlaybookCandidate(
  locationId: string,
  proposal: PlaybookCandidate,
): Promise<boolean> {
  const existing = await prisma.agentPlaybookProposal.findUnique({
    where: {
      locationId_fingerprint: {
        locationId,
        fingerprint: proposal.fingerprint,
      },
    },
  });
  if (existing && existing.status !== "SUGGESTED") return false;

  await prisma.agentPlaybookProposal.upsert({
    where: {
      locationId_fingerprint: {
        locationId,
        fingerprint: proposal.fingerprint,
      },
    },
    update: {
      agentName: proposal.agentName,
      currentConfig: proposal.currentConfig as Prisma.InputJsonValue,
      proposedConfig: proposal.proposedConfig as Prisma.InputJsonValue,
      evidence: proposal.evidence as Prisma.InputJsonValue,
      rationaleFr: proposal.rationaleFr,
      rationaleEn: proposal.rationaleEn,
      rationaleEs: proposal.rationaleEs,
    },
    create: {
      locationId,
      agentName: proposal.agentName,
      fingerprint: proposal.fingerprint,
      currentConfig: proposal.currentConfig as Prisma.InputJsonValue,
      proposedConfig: proposal.proposedConfig as Prisma.InputJsonValue,
      evidence: proposal.evidence as Prisma.InputJsonValue,
      rationaleFr: proposal.rationaleFr,
      rationaleEn: proposal.rationaleEn,
      rationaleEs: proposal.rationaleEs,
      status: "SUGGESTED",
    },
  });
  return true;
}
