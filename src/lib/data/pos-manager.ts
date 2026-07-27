import "server-only";

import type { PosIngestionStatus, PosProvider } from "@/generated/prisma/enums";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { asPlainNumber } from "@/lib/data/serialize";
import { buildClusterWebhookUrl, maskWebhookSecret } from "@/lib/pos/config";
import { prisma } from "@/lib/prisma";

export type PosIngestionLogRow = {
  id: string;
  posOrderId: string;
  netSales: number;
  tipsCollected: number;
  status: PosIngestionStatus;
  processedAt: string;
};

export type ManagerPosReport = {
  locationId: string;
  locationName: string;
  webhookUrl: string;
  integration: {
    provider: PosProvider;
    isActive: boolean;
    externalId: string | null;
    maskedSecret: string;
    updatedAt: string;
  } | null;
  lastSyncAt: string | null;
  isLive: boolean;
  recentIngestions: PosIngestionLogRow[];
};

const LIVE_SYNC_WINDOW_MS = 30 * 60 * 1000;

async function getManagerLocation(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: { location: true },
  });
}

export async function getManagerPosReport(userId: string, userRole: string) {
  if (!canAccessManagerSettings(userRole as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const membership = await getManagerLocation(userId);
  if (!membership) {
    return { ok: false as const, error: "unauthorized" as const };
  }

  const { locationId, location } = membership;

  const [integration, recentIngestions, lastProcessed] = await Promise.all([
    prisma.posIntegration.findUnique({ where: { locationId } }),
    prisma.posIngestionLog.findMany({
      where: { locationId },
      orderBy: { processedAt: "desc" },
      take: 5,
    }),
    prisma.posIngestionLog.findFirst({
      where: { locationId, status: "PROCESSED" },
      orderBy: { processedAt: "desc" },
    }),
  ]);

  const lastSyncAt = lastProcessed?.processedAt.toISOString() ?? null;
  const isLive = Boolean(
    integration?.isActive &&
      lastSyncAt &&
      Date.now() - new Date(lastSyncAt).getTime() < LIVE_SYNC_WINDOW_MS,
  );

  const report: ManagerPosReport = {
    locationId,
    locationName: location.name,
    webhookUrl: buildClusterWebhookUrl(),
    integration: integration
      ? {
          provider: integration.provider,
          isActive: integration.isActive,
          externalId: integration.externalId,
          maskedSecret: maskWebhookSecret(integration.webhookSecret),
          updatedAt: integration.updatedAt.toISOString(),
        }
      : null,
    lastSyncAt,
    isLive,
    recentIngestions: recentIngestions.map((row) => ({
      id: row.id,
      posOrderId: row.posOrderId,
      netSales: asPlainNumber(row.netSales),
      tipsCollected: asPlainNumber(row.tipsCollected),
      status: row.status,
      processedAt: row.processedAt.toISOString(),
    })),
  };

  return { ok: true as const, data: report };
}
