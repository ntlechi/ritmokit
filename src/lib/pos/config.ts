import "server-only";

import type { PosIngestionStatus, PosSalesChannel } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export const CLUSTER_WEBHOOK_PATH = "/api/pos/cluster/webhook";

export function buildClusterWebhookUrl(origin?: string): string {
  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://mirok.ca";
  return `${base.replace(/\/$/, "")}${CLUSTER_WEBHOOK_PATH}`;
}

export async function recordPosIngestion(input: {
  locationId: string;
  posOrderId: string;
  netSales: number;
  tipsCollected: number;
  status: PosIngestionStatus;
  channel?: PosSalesChannel;
  paidAt?: Date | null;
  readyAt?: Date | null;
}) {
  await prisma.posIngestionLog.create({
    data: {
      locationId: input.locationId,
      posOrderId: input.posOrderId,
      netSales: input.netSales,
      tipsCollected: input.tipsCollected,
      status: input.status,
      channel: input.channel ?? "IN_STORE",
      paidAt: input.paidAt ?? null,
      readyAt: input.readyAt ?? null,
    },
  });
}

export function maskWebhookSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return `${"•".repeat(Math.min(secret.length - 4, 24))}${secret.slice(-4)}`;
}
