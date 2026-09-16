/**
 * Multi-tenant Integration Hub credential resolver.
 * Prefer OrganizationIntegration (encrypted); fall back to platform PAYPAL_* env.
 */
import "server-only";

import { decryptField } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_INTEGRATION_STATUSES,
  type IntegrationStatus,
  type PayPalIntegrationConfig,
  type ResolvedPayPalCredentials,
  type ResolvedStripeCredentials,
  type StripeIntegrationConfig,
} from "@/lib/integrations/types";

function parsePayPalConfig(raw: string | null): PayPalIntegrationConfig | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PayPalIntegrationConfig>;
    const clientId = parsed.clientId?.trim() ?? "";
    const clientSecret = parsed.clientSecret?.trim() ?? "";
    const webhookId = parsed.webhookId?.trim() ?? "";
    const mode = parsed.mode === "live" ? "live" : "sandbox";
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, webhookId, mode };
  } catch {
    return null;
  }
}

function envPayPalCredentials(
  organizationId: string | null,
): ResolvedPayPalCredentials | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const mode =
    (process.env.PAYPAL_MODE ?? "sandbox").toLowerCase() === "live"
      ? "live"
      : "sandbox";

  return {
    clientId,
    clientSecret,
    webhookId: process.env.PAYPAL_WEBHOOK_ID?.trim() ?? "",
    mode,
    source: "env",
    organizationId,
    status: "env",
  };
}

export async function resolveOrganizationIdForEnrollment(
  enrollmentId: string,
): Promise<string | null> {
  const row = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      session: {
        select: {
          course: { select: { organizationId: true } },
          season: { select: { location: { select: { organizationId: true } } } },
          room: { select: { location: { select: { organizationId: true } } } },
        },
      },
    },
  });
  if (!row) return null;
  return (
    row.session.course.organizationId ||
    row.session.season?.location.organizationId ||
    row.session.room.location.organizationId ||
    null
  );
}

export async function resolveOrganizationIdForSession(
  sessionId: string,
): Promise<string | null> {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: {
      course: { select: { organizationId: true } },
      season: { select: { location: { select: { organizationId: true } } } },
      room: { select: { location: { select: { organizationId: true } } } },
    },
  });
  if (!session) return null;
  return (
    session.course.organizationId ||
    session.season?.location.organizationId ||
    session.room.location.organizationId ||
    null
  );
}

async function loadHubPayPal(
  organizationId: string,
): Promise<ResolvedPayPalCredentials | null> {
  const row = await prisma.organizationIntegration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "PAYPAL",
      },
    },
    select: {
      status: true,
      encryptedConfig: true,
    },
  });

  if (!row) return null;
  if (!ACTIVE_INTEGRATION_STATUSES.includes(row.status)) return null;

  const decrypted = decryptField(row.encryptedConfig);
  const config = parsePayPalConfig(decrypted);
  if (!config) return null;

  return {
    ...config,
    source: "hub",
    organizationId,
    status: row.status,
  };
}

/**
 * Resolve PayPal merchant credentials for a studio (hub first, then env fallback).
 */
export async function getPayPalCredentialsForOrg(
  organizationId: string | null | undefined,
): Promise<ResolvedPayPalCredentials | null> {
  if (organizationId) {
    const hub = await loadHubPayPal(organizationId);
    if (hub) return hub;
  }
  return envPayPalCredentials(organizationId ?? null);
}

export async function getPayPalCredentialsForEnrollment(
  enrollmentId: string,
): Promise<ResolvedPayPalCredentials | null> {
  const organizationId = await resolveOrganizationIdForEnrollment(enrollmentId);
  return getPayPalCredentialsForOrg(organizationId);
}

export async function getPayPalCredentialsForSession(
  sessionId: string,
): Promise<ResolvedPayPalCredentials | null> {
  const organizationId = await resolveOrganizationIdForSession(sessionId);
  return getPayPalCredentialsForOrg(organizationId);
}

export type PayPalWebhookCandidate = ResolvedPayPalCredentials & {
  integrationId?: string;
};

/** All hub PayPal integrations that can verify webhooks, plus env fallback. */
export async function listPayPalWebhookCandidates(): Promise<PayPalWebhookCandidate[]> {
  const rows = await prisma.organizationIntegration.findMany({
    where: {
      provider: "PAYPAL",
      status: { in: ACTIVE_INTEGRATION_STATUSES },
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      encryptedConfig: true,
    },
  });

  const fromHub: PayPalWebhookCandidate[] = [];
  for (const row of rows) {
    const decrypted = decryptField(row.encryptedConfig);
    const config = parsePayPalConfig(decrypted);
    if (!config?.webhookId) continue;
    fromHub.push({
      ...config,
      source: "hub",
      organizationId: row.organizationId,
      status: row.status,
      integrationId: row.id,
    });
  }

  const fromEnv = envPayPalCredentials(null);
  if (fromEnv?.webhookId) {
    return [...fromHub, fromEnv];
  }
  return fromHub;
}

/** Origins from Integration Hub (CONNECTED / TESTING / ERROR keep whitelist). */
export async function getHubAllowedOrigins(): Promise<string[]> {
  const rows = await prisma.organizationIntegration.findMany({
    where: {
      status: { not: "DISCONNECTED" },
    },
    select: { allowedOrigins: true },
  });

  return Array.from(
    new Set(
      rows.flatMap((r) =>
        r.allowedOrigins.map((o) => o.trim()).filter(Boolean),
      ),
    ),
  );
}

function parseStripeConfig(raw: string | null): StripeIntegrationConfig | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StripeIntegrationConfig>;
    const secretKey = parsed.secretKey?.trim() ?? "";
    const webhookSecret = parsed.webhookSecret?.trim() ?? "";
    const mode = parsed.mode === "live" || secretKey.startsWith("sk_live_") ? "live" : "test";
    if (!secretKey) return null;
    return { secretKey, webhookSecret, mode };
  } catch {
    return null;
  }
}

function envStripeCredentials(
  organizationId: string | null,
): ResolvedStripeCredentials | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  const mode =
    secretKey.startsWith("sk_live_") || process.env.STRIPE_MODE === "live" ? "live" : "test";
  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    mode,
    source: "env",
    organizationId,
    status: "env",
  };
}

async function loadHubStripe(
  organizationId: string,
): Promise<ResolvedStripeCredentials | null> {
  const row = await prisma.organizationIntegration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "STRIPE",
      },
    },
    select: {
      status: true,
      encryptedConfig: true,
    },
  });

  if (!row) return null;
  if (!ACTIVE_INTEGRATION_STATUSES.includes(row.status)) return null;

  const decrypted = decryptField(row.encryptedConfig);
  const config = parseStripeConfig(decrypted);
  if (!config) return null;

  return {
    ...config,
    source: "hub",
    organizationId,
    status: row.status,
  };
}

export async function getStripeCredentialsForOrg(
  organizationId: string | null | undefined,
): Promise<ResolvedStripeCredentials | null> {
  if (organizationId) {
    const hub = await loadHubStripe(organizationId);
    if (hub) return hub;
  }
  return envStripeCredentials(organizationId ?? null);
}

export async function getStripeCredentialsForEnrollment(
  enrollmentId: string,
): Promise<ResolvedStripeCredentials | null> {
  const organizationId = await resolveOrganizationIdForEnrollment(enrollmentId);
  return getStripeCredentialsForOrg(organizationId);
}

export async function getStripeCredentialsForSession(
  sessionId: string,
): Promise<ResolvedStripeCredentials | null> {
  const organizationId = await resolveOrganizationIdForSession(sessionId);
  return getStripeCredentialsForOrg(organizationId);
}

export type StripeWebhookCandidate = ResolvedStripeCredentials & {
  integrationId?: string;
};

export async function listStripeWebhookCandidates(): Promise<StripeWebhookCandidate[]> {
  const rows = await prisma.organizationIntegration.findMany({
    where: {
      provider: "STRIPE",
      status: { in: ACTIVE_INTEGRATION_STATUSES },
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      encryptedConfig: true,
    },
  });

  const fromHub: StripeWebhookCandidate[] = [];
  for (const row of rows) {
    const decrypted = decryptField(row.encryptedConfig);
    const config = parseStripeConfig(decrypted);
    if (!config?.webhookSecret) continue;
    fromHub.push({
      ...config,
      source: "hub",
      organizationId: row.organizationId,
      status: row.status,
      integrationId: row.id,
    });
  }

  const fromEnv = envStripeCredentials(null);
  if (fromEnv?.webhookSecret) {
    return [...fromHub, fromEnv];
  }
  return fromHub;
}

export function preferredPublicPaymentProvider(
  paypalStatus: IntegrationStatus | "env" | null,
  stripeStatus?: IntegrationStatus | "env" | null,
): "paypal" | "stripe" | "none" {
  if (paypalStatus === "CONNECTED" || paypalStatus === "TESTING" || paypalStatus === "env") {
    return "paypal";
  }
  if (stripeStatus === "CONNECTED" || stripeStatus === "TESTING" || stripeStatus === "env") {
    return "stripe";
  }
  const raw = (process.env.RITMOKIT_PUBLIC_PAYMENT_PROVIDER ?? "none").toLowerCase();
  if (raw === "paypal" || raw === "stripe") return raw;
  return "none";
}
