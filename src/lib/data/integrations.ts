import "server-only";

import { canAccessManagerSettings } from "@/lib/auth/session";
import { decryptField } from "@/lib/crypto/field-encryption";
import type {
  IntegrationStatus,
  PayPalIntegrationConfig,
} from "@/lib/integrations/types";
import { prisma } from "@/lib/prisma";

export type PayPalIntegrationView = {
  organizationId: string;
  organizationName: string;
  locationId: string;
  status: IntegrationStatus;
  mode: "sandbox" | "live";
  clientIdMasked: string;
  hasClientSecret: boolean;
  webhookIdMasked: string;
  allowedOrigins: string[];
  lastError: string | null;
  webhookUrl: string;
  updatedAt: string | null;
  /** True when platform PAYPAL_* env would apply as fallback. */
  envFallbackAvailable: boolean;
};

function maskSecret(value: string | undefined | null): string {
  const v = value?.trim() ?? "";
  if (!v) return "";
  if (v.length <= 8) return "••••••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function parseConfig(encrypted: string | null | undefined): Partial<PayPalIntegrationConfig> {
  if (!encrypted) return {};
  try {
    const raw = decryptField(encrypted);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PayPalIntegrationConfig>;
  } catch {
    return {};
  }
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

export async function getPayPalIntegrationSettings(
  userId: string,
  role: string,
): Promise<{ ok: true; data: PayPalIntegrationView } | { ok: false; error: string }> {
  if (!canAccessManagerSettings(role as Parameters<typeof canAccessManagerSettings>[0])) {
    return { ok: false, error: "unauthorized" };
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: {
        select: {
          id: true,
          organizationId: true,
          organization: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!membership) return { ok: false, error: "not_found" };

  const org = membership.location.organization;
  const row = await prisma.organizationIntegration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: org.id,
        provider: "PAYPAL",
      },
    },
  });

  const config = parseConfig(row?.encryptedConfig);
  const envFallbackAvailable = Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim(),
  );

  return {
    ok: true,
    data: {
      organizationId: org.id,
      organizationName: org.name,
      locationId: membership.locationId,
      status: row?.status ?? "DISCONNECTED",
      mode: config.mode === "live" ? "live" : "sandbox",
      clientIdMasked: maskSecret(config.clientId),
      hasClientSecret: Boolean(config.clientSecret?.trim()),
      webhookIdMasked: maskSecret(config.webhookId),
      allowedOrigins: row?.allowedOrigins ?? [],
      lastError: row?.lastError ?? null,
      webhookUrl: `${appBaseUrl()}/api/webhooks/paypal`,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      envFallbackAvailable,
    },
  };
}
