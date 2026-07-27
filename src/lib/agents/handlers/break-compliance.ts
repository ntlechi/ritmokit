import { prisma } from "@/lib/prisma";
import type { ShiftModel } from "@/generated/prisma/models";

export type BreakComplianceViolation = "MISSED_BREAK" | "SHORT_BREAK";

export type BreakComplianceAssessment = {
  violation: BreakComplianceViolation | null;
  breakTakenMinutes: number;
  requiredMinutes: number;
};

/**
 * Évalue si la pause CNESST obligatoire a été réellement prise, à partir des
 * horodatages de pointage — pas seulement de la grille planifiée.
 * `breakRequiredMinutes` est déjà calculé par le trigger Postgres CNESST à
 * la création du quart (30 min si la durée planifiée ≥ 5h consécutives,
 * voir supabase/migrations/0001).
 */
export function evaluateBreakCompliance(shift: {
  breakRequiredMinutes: number;
  breakStartedAt: Date | null;
  breakEndedAt: Date | null;
}): BreakComplianceAssessment {
  const requiredMinutes = shift.breakRequiredMinutes;

  if (requiredMinutes <= 0) {
    return { violation: null, breakTakenMinutes: 0, requiredMinutes };
  }

  if (!shift.breakStartedAt || !shift.breakEndedAt) {
    return { violation: "MISSED_BREAK", breakTakenMinutes: 0, requiredMinutes };
  }

  const breakTakenMinutes = Math.round(
    (shift.breakEndedAt.getTime() - shift.breakStartedAt.getTime()) / (60 * 1000),
  );

  if (breakTakenMinutes < requiredMinutes) {
    return { violation: "SHORT_BREAK", breakTakenMinutes, requiredMinutes };
  }

  return { violation: null, breakTakenMinutes, requiredMinutes };
}

type ViolationShift = Pick<ShiftModel, "id" | "locationId" | "employeeId" | "createdById" | "startsAt" | "stationId">;

/**
 * Trace d'assiduité pour le tableau de bord gérant (même contrat que
 * `logCrisisPolicyAudit` dans crisis.ts) + alerte dans le canal #gestion —
 * déclenché depuis `clockOutAction` quand une pause obligatoire n'a pas été
 * respectée. Ne bloque jamais le pointage de l'employé : les erreurs sont
 * gérées par l'appelant.
 */
export async function recordBreakComplianceViolation(input: {
  shift: ViolationShift;
  assessment: BreakComplianceAssessment;
}) {
  const { shift, assessment } = input;
  if (!assessment.violation) return;

  const shiftDateLabel = shift.startsAt.toLocaleDateString("fr-CA", { timeZone: "America/Toronto" });
  const actionTaken =
    assessment.violation === "MISSED_BREAK"
      ? `Pause CNESST omise pour le quart du ${shiftDateLabel} (${assessment.requiredMinutes} min requises).`
      : `Pause insuffisante pour le quart du ${shiftDateLabel} : ${assessment.breakTakenMinutes} min prise sur ${assessment.requiredMinutes} min requises.`;

  await prisma.agentLog.create({
    data: {
      channel: "agent:cnesst",
      eventType: "shift.break_violation_detected",
      relatedShiftId: shift.id,
      payload: {
        auditType: "policy_assiduity",
        agentName: "ComplianceAgent",
        employeeId: shift.employeeId,
        locationId: shift.locationId,
        policyViolation: assessment.violation,
        severity: "HIGH",
        shiftStartsAt: shift.startsAt.toISOString(),
        actionTaken,
        breakTakenMinutes: assessment.breakTakenMinutes,
        breakRequiredMinutes: assessment.requiredMinutes,
      },
      status: "SUCCEEDED",
      result: { logged: true, policyViolation: assessment.violation },
      completedAt: new Date(),
    },
  });

  await pushBreakComplianceAlert({ shift, assessment, actionTaken });
}

async function pushBreakComplianceAlert(input: {
  shift: ViolationShift;
  assessment: BreakComplianceAssessment;
  actionTaken: string;
}) {
  const { shift, assessment, actionTaken } = input;
  if (!shift.locationId) return;

  const managementChannel = await prisma.chatChannel.findFirst({
    where: { locationId: shift.locationId, type: "MANAGEMENT", isArchived: false },
  });
  if (!managementChannel) return;

  const [employee, spokesperson] = await Promise.all([
    shift.employeeId ? prisma.user.findUnique({ where: { id: shift.employeeId } }) : null,
    resolveAlertAuthor(shift.locationId, shift.createdById),
  ]);
  if (!spokesperson) return;

  const employeeName = employee?.fullName ?? "Un employé";
  const emoji = assessment.violation === "MISSED_BREAK" ? "☕⚠️" : "☕";

  await prisma.chatMessage.create({
    data: {
      channelId: managementChannel.id,
      authorId: spokesperson.id,
      contentType: "AGENT",
      body: `${emoji} ${employeeName} — ${actionTaken}`,
      metadata: {
        intent: "break_compliance_violation",
        policyViolation: assessment.violation,
        breakTakenMinutes: assessment.breakTakenMinutes,
        breakRequiredMinutes: assessment.requiredMinutes,
        employeeId: shift.employeeId,
        shiftId: shift.id,
      },
    },
  });
}

/**
 * L'alerte doit être attribuée à un utilisateur réel (FK obligatoire) même si
 * elle est visuellement rendue comme un message d'agent (voir ChannelThread).
 * On préfère le manager qui a créé le quart concerné ; à défaut, le membre
 * Owner/Manager le plus ancien de la succursale (même logique que
 * `late-arrival.ts`).
 */
async function resolveAlertAuthor(locationId: string, createdById: string | null) {
  if (createdById) {
    const creator = await prisma.user.findUnique({ where: { id: createdById } });
    if (creator) return creator;
  }

  const fallback = await prisma.locationMember.findFirst({
    where: { locationId, user: { role: { in: ["OWNER", "MANAGER"] } } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return fallback?.user ?? null;
}
