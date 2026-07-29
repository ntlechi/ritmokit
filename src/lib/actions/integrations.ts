"use server";

import { revalidatePath } from "next/cache";
import { actionDatabaseError } from "@/lib/actions/result";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import type {
  IntegrationStatus,
  PayPalIntegrationConfig,
} from "@/lib/integrations/types";
import { testPayPalConnection } from "@/lib/payments/paypal";
import { prisma } from "@/lib/prisma";

export type IntegrationActionResult =
  | { ok: true; status: IntegrationStatus }
  | { ok: false; error: string };

async function resolveManagerOrg(userId: string) {
  return prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true, location: { select: { organizationId: true } } },
  });
}

function parseOrigins(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ),
  );
}

function loadExistingConfig(encrypted: string | null | undefined): Partial<PayPalIntegrationConfig> {
  if (!encrypted) return {};
  try {
    const raw = decryptField(encrypted);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PayPalIntegrationConfig>;
  } catch {
    return {};
  }
}

export async function savePayPalIntegrationAction(input: {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  mode: "sandbox" | "live";
  allowedOrigins: string;
  /** When true, blank secret keeps previous secret. */
  keepExistingSecret?: boolean;
}): Promise<IntegrationActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerOrg(user.id);
    if (!membership) return { ok: false, error: "not_found" };

    const organizationId = membership.location.organizationId;
    const existing = await prisma.organizationIntegration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "PAYPAL" },
      },
    });

    const prev = loadExistingConfig(existing?.encryptedConfig);
    const clientId = input.clientId.trim() || prev.clientId?.trim() || "";
    let clientSecret = input.clientSecret.trim();
    if (!clientSecret && input.keepExistingSecret) {
      clientSecret = prev.clientSecret?.trim() ?? "";
    }
    const webhookId = input.webhookId.trim() || prev.webhookId?.trim() || "";
    const mode = input.mode === "live" ? "live" : "sandbox";
    const allowedOrigins = parseOrigins(input.allowedOrigins);

    if (!clientId || !clientSecret) {
      return { ok: false, error: "missing_credentials" };
    }

    const config: PayPalIntegrationConfig = {
      clientId,
      clientSecret,
      webhookId,
      mode,
    };

    const encryptedConfig = encryptField(JSON.stringify(config));
    if (!encryptedConfig) {
      return { ok: false, error: "encrypt_failed" };
    }

    const status: IntegrationStatus =
      existing?.status === "CONNECTED" || existing?.status === "TESTING"
        ? existing.status
        : "DISCONNECTED";

    await prisma.organizationIntegration.upsert({
      where: {
        organizationId_provider: { organizationId, provider: "PAYPAL" },
      },
      create: {
        organizationId,
        provider: "PAYPAL",
        status,
        encryptedConfig,
        allowedOrigins,
        lastError: null,
      },
      update: {
        encryptedConfig,
        allowedOrigins,
        lastError: null,
        ...(status === "DISCONNECTED" ? {} : { status }),
      },
    });

    revalidatePath("/[lang]/settings/manager/integrations", "page");
    return { ok: true, status };
  } catch (error) {
    return actionDatabaseError("integrations:save", error);
  }
}

export async function testPayPalIntegrationAction(): Promise<IntegrationActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerOrg(user.id);
    if (!membership) return { ok: false, error: "not_found" };

    const organizationId = membership.location.organizationId;
    const row = await prisma.organizationIntegration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "PAYPAL" },
      },
    });

    if (!row) return { ok: false, error: "not_configured" };

    const config = loadExistingConfig(row.encryptedConfig) as PayPalIntegrationConfig;
    if (!config.clientId || !config.clientSecret) {
      return { ok: false, error: "missing_credentials" };
    }

    const result = await testPayPalConnection({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      webhookId: config.webhookId ?? "",
      mode: config.mode === "live" ? "live" : "sandbox",
    });

    if (!result.ok) {
      await prisma.organizationIntegration.update({
        where: { id: row.id },
        data: { status: "ERROR", lastError: result.error },
      });
      revalidatePath("/[lang]/settings/manager/integrations", "page");
      return { ok: false, error: result.error };
    }

    const status: IntegrationStatus = config.mode === "live" ? "CONNECTED" : "TESTING";
    await prisma.organizationIntegration.update({
      where: { id: row.id },
      data: { status, lastError: null },
    });

    revalidatePath("/[lang]/settings/manager/integrations", "page");
    return { ok: true, status };
  } catch (error) {
    return actionDatabaseError("integrations:test", error);
  }
}

export async function disconnectPayPalIntegrationAction(): Promise<IntegrationActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await resolveManagerOrg(user.id);
    if (!membership) return { ok: false, error: "not_found" };

    const organizationId = membership.location.organizationId;
    const empty = encryptField(JSON.stringify({ cleared: true, mode: "sandbox" }));
    if (!empty) return { ok: false, error: "encrypt_failed" };

    await prisma.organizationIntegration.upsert({
      where: {
        organizationId_provider: { organizationId, provider: "PAYPAL" },
      },
      create: {
        organizationId,
        provider: "PAYPAL",
        status: "DISCONNECTED",
        encryptedConfig: empty,
        allowedOrigins: [],
        lastError: null,
      },
      update: {
        status: "DISCONNECTED",
        encryptedConfig: empty,
        lastError: null,
      },
    });

    revalidatePath("/[lang]/settings/manager/integrations", "page");
    return { ok: true, status: "DISCONNECTED" };
  } catch (error) {
    return actionDatabaseError("integrations:disconnect", error);
  }
}
