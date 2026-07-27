import "server-only";

import { prisma } from "@/lib/prisma";
import { formatTimeRange } from "@/lib/calendar/format";
import type { Locale } from "@/lib/i18n/config";

/** Notifie l'employé d'origine — canal de station (push natif à brancher ultérieurement). */
export async function notifyEmployeeSicknessAck(input: {
  shiftId: string;
  locationId: string;
  stationId: string;
  employeeId: string;
  employeeName: string;
  startsAt: Date;
  endsAt: Date;
  managerId: string;
  lang: Locale;
}) {
  const channel = await prisma.chatChannel.findFirst({
    where: { locationId: input.locationId, stationId: input.stationId, type: "STATION" },
    select: { id: true },
  });
  if (!channel) return;

  const managerMember = await prisma.chatChannelMember.findUnique({
    where: { channelId_userId: { channelId: channel.id, userId: input.managerId } },
  });
  if (!managerMember?.canPost) return;

  const timeLabel = formatTimeRange(input.startsAt, input.endsAt, input.lang);
  const dateLabel = new Intl.DateTimeFormat(input.lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Toronto",
  }).format(input.startsAt);

  await prisma.chatMessage.create({
    data: {
      channelId: channel.id,
      authorId: input.managerId,
      contentType: "TEXT",
      body: `🏥 ${input.employeeName} — Ton quart du ${dateLabel} (${timeLabel}) a été retiré suite à un signalement de maladie. Prends soin de toi. Contacte le gérant si c'est une erreur.`,
      metadata: {
        intent: "sickness_acknowledgement",
        shiftId: input.shiftId,
        employeeId: input.employeeId,
        absenceReason: "SICKNESS",
      },
    },
  });
}

/** Trace l'absence dans le journal d'assiduité (même schéma que l'Agent de Crise). */
export async function logManagerReportedSickness(input: {
  shiftId: string;
  locationId: string;
  employeeId: string;
  startsAt: Date;
  reportedByUserId: string;
}) {
  const shiftDateLabel = input.startsAt.toLocaleDateString("fr-CA", {
    timeZone: "America/Toronto",
  });

  await prisma.agentLog.create({
    data: {
      channel: "agent:crisis",
      eventType: "shift.sickness_reported",
      relatedShiftId: input.shiftId,
      payload: {
        auditType: "policy_assiduity",
        employeeId: input.employeeId,
        locationId: input.locationId,
        policyViolation: "MANAGER_REPORTED_SICKNESS",
        severity: "HIGH",
        shiftStartsAt: input.startsAt.toISOString(),
        actionTaken: `Maladie signalée par le gérant pour le quart du ${shiftDateLabel}`,
        absenceReason: "SICKNESS",
        reportedByUserId: input.reportedByUserId,
      },
      status: "SUCCEEDED",
      result: { logged: true, absenceReason: "SICKNESS" },
      completedAt: new Date(),
    },
  });
}
