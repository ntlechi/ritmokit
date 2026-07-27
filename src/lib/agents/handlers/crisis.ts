import { prisma } from "@/lib/prisma";
import { getAgentPlaybookSettings } from "@/lib/rsi/playbooks";
import type { AgentLogRow } from "../schemas";
import {
  assessShortNoticePolicy,
  findAvailableReplacementsForShift,
  type CrisisPolicyAssessment,
} from "../find-available-replacements";

/**
 * Agent de Crise — boucle de remplacement. Déclenché quand un quart passe
 * en REJECTED ou CRISIS_ALERT. Croise disponibilités récurrentes, congés
 * approuvés et blindage CNESST avant de proposer un remplaçant.
 * Playbook RSI 2 (`allowCrossStation`) élargit le balayage si approuvé.
 */
export async function runCrisisAgent(log: AgentLogRow) {
  if (!log.related_shift_id) {
    return { matched: false, reason: "no_related_shift" };
  }

  const shift = await prisma.shift.findUnique({
    where: { id: log.related_shift_id },
  });

  if (!shift) {
    return { matched: false, reason: "shift_not_found" };
  }

  // Code Rouge = liquidité flash premier-arrivé : l'agent ne doit PAS
  // pré-assigner un candidat (ça casserait la course atomique des bids).
  if (shift.urgency === "CODE_RED") {
    return {
      matched: false,
      reason: "code_red_marketplace",
      deferredToEmergencyBids: true,
    };
  }

  const policy = assessShortNoticePolicy(shift.startsAt);
  await logCrisisPolicyAudit({ shift, policy, sourceAgentLogId: log.id });

  const playbook = await getAgentPlaybookSettings(shift.locationId, "CRISIS_REPLACEMENT");
  const match = await findAvailableReplacementsForShift(shift, {
    allowCrossStation: playbook.allowCrossStation,
    preferSameStationFirst: playbook.preferSameStationFirst,
  });

  if (match.candidates.length === 0) {
    return {
      matched: false,
      reason: "no_eligible_candidate",
      candidatesScanned: match.scanned,
      rejections: match.rejections,
      policy,
      playbook,
    };
  }

  const eligible = match.candidates[0];

  const swapRequest = await prisma.shiftSwapRequest.create({
    data: {
      shiftId: shift.id,
      requestedById: shift.createdById,
      targetEmployeeId: eligible.userId,
      status: "AGENT_NEGOTIATING",
      resolvedByAgent: true,
      reason: "Remplacement automatique — Agent de Crise",
    },
  });

  await prisma.shift.update({
    where: { id: shift.id },
    data: { status: "PENDING_CONFIRMATION" },
  });

  return {
    matched: true,
    candidateUserId: eligible.userId,
    candidateName: eligible.fullName,
    swapRequestId: swapRequest.id,
    candidatesScanned: match.scanned,
    eligibleCount: match.candidates.length,
    rejections: match.rejections,
    policy,
    playbook,
  };
}

/**
 * Trace d'assiduité pour le tableau de bord gérant — statut SUCCEEDED pour
 * éviter un second passage dans le webhook (seuls les PENDING sont traités).
 */
async function logCrisisPolicyAudit(input: {
  shift: {
    id: string;
    locationId: string;
    employeeId: string | null;
    startsAt: Date;
  };
  policy: CrisisPolicyAssessment;
  sourceAgentLogId: string;
}) {
  const shiftDateLabel = input.shift.startsAt.toLocaleDateString("fr-CA", {
    timeZone: "America/Toronto",
  });

  await prisma.agentLog.create({
    data: {
      channel: "agent:crisis",
      eventType: "shift.crisis",
      relatedShiftId: input.shift.id,
      payload: {
        auditType: "policy_assiduity",
        sourceAgentLogId: input.sourceAgentLogId,
        agentName: "CrisisAgent",
        employeeId: input.shift.employeeId,
        locationId: input.shift.locationId,
        policyViolation: input.policy.policyViolation,
        severity: input.policy.severity,
        shiftStartsAt: input.shift.startsAt.toISOString(),
        actionTaken: `Traitement d'une alerte de crise pour le quart du ${shiftDateLabel}`,
      },
      status: "SUCCEEDED",
      result: {
        logged: true,
        policyViolation: input.policy.policyViolation,
        severity: input.policy.severity,
      },
      completedAt: new Date(),
    },
  });
}
