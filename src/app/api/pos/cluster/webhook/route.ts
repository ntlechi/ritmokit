import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import type { PosSalesChannel } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { recordPosIngestion } from "@/lib/pos/config";
import { toTorontoBusinessBucket } from "@/lib/pos/toronto-bucket";

export const runtime = "nodejs";

/**
 * Passerelle Cluster POS — un événement par facture fermée au comptoir.
 * Chaque tranche horaire (`PosSalesHourly`) est cumulée en direct pour
 * alimenter le Live Labor Cost % / SPLH et pré-remplir la clôture des
 * pourboires, sans aucune saisie manuelle du gérant.
 *
 * Sécurité : signature HMAC-SHA256 du corps brut, comparée en temps
 * constant (`timingSafeEqual`) — jamais d'égalité de chaîne naïve sur un
 * secret. Idempotence : `PosIdempotencyLog` bloque tout retry réseau qui
 * renverrait la même facture (`pos_order_id`).
 *
 * Configuration côté Cluster : POST vers
 *   https://mirok.ca/api/pos/cluster/webhook
 *   Header: x-cluster-signature: hex(hmac_sha256(raw_body, webhookSecret))
 */

const CLOSED_ORDER_EVENTS = new Set(["order.closed", "invoice.paid"]);

function verifySignature(rawBody: string, secret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signatureHeader.trim(), "hex");

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function toFiniteNonNegative(value: unknown): number | null {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

const CHANNEL_MAP: Record<string, PosSalesChannel> = {
  in_store: "IN_STORE",
  instore: "IN_STORE",
  counter: "IN_STORE",
  ueat: "UEAT",
  doordash: "DOORDASH",
  door_dash: "DOORDASH",
  other: "OTHER",
};

function parseChannel(data: Record<string, unknown>): PosSalesChannel {
  const raw =
    (data.channel as string | undefined) ??
    (data.sales_channel as string | undefined) ??
    ((data.source as Record<string, unknown> | undefined)?.channel as string | undefined);
  if (!raw) return "IN_STORE";
  return CHANNEL_MAP[raw.toLowerCase().replace(/-/g, "_")] ?? "OTHER";
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = (payload.data as Record<string, unknown> | undefined) ?? payload;
  const externalLocationId =
    (payload.location_id as string | undefined) ?? (data.location_id as string | undefined);

  if (!externalLocationId) {
    return NextResponse.json({ error: "missing_location_context" }, { status: 400 });
  }

  try {
    const integration = await prisma.posIntegration.findFirst({
      where: { externalId: externalLocationId, provider: "CLUSTER", isActive: true },
    });

    if (!integration) {
      return NextResponse.json({ error: "integration_not_configured" }, { status: 404 });
    }

    const signatureHeader = request.headers.get("x-cluster-signature");
    if (!verifySignature(rawBody, integration.webhookSecret, signatureHeader)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    const eventType = payload.event as string | undefined;
    if (!eventType || !CLOSED_ORDER_EVENTS.has(eventType)) {
      return NextResponse.json({ received: true, status: "ignored_event_type" });
    }

    const orderId = (data.id as string | undefined) ?? (data.order_id as string | undefined);
    if (!orderId) {
      return NextResponse.json({ error: "missing_order_id" }, { status: 400 });
    }

    const closedAtRaw = (data.closed_at as string | undefined) ?? (data.closedAt as string | undefined);
    const closedAt = closedAtRaw ? new Date(closedAtRaw) : null;
    if (!closedAt || Number.isNaN(closedAt.getTime())) {
      return NextResponse.json({ error: "invalid_closed_at" }, { status: 400 });
    }

    const totals = (data.totals as Record<string, unknown> | undefined) ?? {};
    const netSales = toFiniteNonNegative(totals.net_amount ?? data.net_amount);
    const tipsCollected = toFiniteNonNegative(totals.tips_amount ?? data.tips_amount);
    const channel = parseChannel(data);
    const paidAt =
      parseOptionalDate(data.paid_at ?? data.paidAt) ??
      parseOptionalDate((data.timing as Record<string, unknown> | undefined)?.paid_at);
    const readyAt =
      parseOptionalDate(data.ready_at ?? data.readyAt ?? data.sealed_at) ??
      parseOptionalDate((data.timing as Record<string, unknown> | undefined)?.ready_at);

    if (netSales === null || tipsCollected === null) {
      return NextResponse.json({ error: "invalid_amounts" }, { status: 400 });
    }

    // Idempotence anticipée — évite de payer une transaction DB pour un
    // retry réseau déjà connu (le `create` ci-dessous reste le garde-fou
    // final atomique en cas de course entre deux requêtes concurrentes).
    const alreadyProcessed = await prisma.posIdempotencyLog.findUnique({
      where: { posOrderId: orderId },
    });
    if (alreadyProcessed) {
      await recordPosIngestion({
        locationId: integration.locationId,
        posOrderId: orderId,
        netSales,
        tipsCollected,
        status: "DUPLICATE",
        channel,
        paidAt,
        readyAt,
      });
      return NextResponse.json({ received: true, status: "duplicate_blocked" });
    }

    const { datePure, hour } = toTorontoBusinessBucket(closedAt);

    try {
      await prisma.$transaction([
        prisma.posIdempotencyLog.create({ data: { posOrderId: orderId } }),
        prisma.posSalesHourly.upsert({
          where: { locationId_date_hour: { locationId: integration.locationId, date: datePure, hour } },
          update: {
            netSales: { increment: netSales },
            tipsCollected: { increment: tipsCollected },
            orderCount: { increment: 1 },
          },
          create: {
            locationId: integration.locationId,
            date: datePure,
            hour,
            netSales,
            tipsCollected,
            orderCount: 1,
          },
        }),
        prisma.posChannelSalesDaily.upsert({
          where: {
            locationId_date_channel: {
              locationId: integration.locationId,
              date: datePure,
              channel,
            },
          },
          update: {
            netSales: { increment: netSales },
            orderCount: { increment: 1 },
          },
          create: {
            locationId: integration.locationId,
            date: datePure,
            channel,
            netSales,
            orderCount: 1,
          },
        }),
      ]);
      await recordPosIngestion({
        locationId: integration.locationId,
        posOrderId: orderId,
        netSales,
        tipsCollected,
        status: "PROCESSED",
        channel,
        paidAt,
        readyAt,
      });
    } catch (error) {
      // Course entre deux livraisons concurrentes du même order_id — la
      // contrainte unique sur `pos_order_id` a gagné la course pour nous.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await recordPosIngestion({
          locationId: integration.locationId,
          posOrderId: orderId,
          netSales,
          tipsCollected,
          status: "DUPLICATE",
        });
        return NextResponse.json({ received: true, status: "duplicate_blocked" });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, status: "processed_live_kpis_updated" });
  } catch (error) {
    console.error("[CLUSTER_POS_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "internal_server_error" }, { status: 500 });
  }
}
