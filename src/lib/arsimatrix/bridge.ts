/**
 * Mirok → Arsimatrix bridge (repos stay separate).
 * Pushes job applications to the factory bus for bati-recruit.
 */
import type { JobApplication, JobShiftWindow, Location } from "@/generated/prisma/client";
import type { MirokApplicationWire } from "@/lib/careers/schemas";

export type ArsimatrixBridgeConfig = {
  enabled: boolean;
  matrixUrl: string;
  bridgeSecret?: string;
};

export function loadArsimatrixConfig(): ArsimatrixBridgeConfig {
  const matrixUrl = (
    process.env.ARSIMATRIX_URL ?? "http://127.0.0.1:3100"
  ).replace(/\/$/, "");
  const bridgeSecret = process.env.ARSIMATRIX_BRIDGE_SECRET?.trim() || undefined;
  const enabled =
    process.env.ARSIMATRIX_ENABLED?.trim().toLowerCase() === "true" ||
    Boolean(process.env.ARSIMATRIX_URL?.trim());
  return { enabled, matrixUrl, bridgeSecret };
}

const SHIFT_MAP: Record<JobShiftWindow, MirokApplicationWire["availableShifts"][number]> = {
  MIDI: "midi",
  SOIR: "soir",
  FERMETURE: "fermeture",
  WEEKEND: "weekend",
};

function siteFromLocation(location: Location): "charlesbourg" | "saint-roch" {
  const hay = `${location.slug} ${location.name} ${location.city ?? ""}`.toLowerCase();
  if (/saint[- ]?roch|st[- ]?roch/.test(hay)) return "saint-roch";
  return "charlesbourg";
}

export function toMirokWire(
  app: JobApplication,
  location: Location
): MirokApplicationWire {
  return {
    id: app.id,
    locationId: app.locationId,
    locationSlug: location.slug,
    site: siteFromLocation(location),
    fullName: app.fullName,
    email: app.email,
    phone: app.phone,
    neighborhood: app.neighborhood,
    availableShifts: app.availableShifts.map((s) => SHIFT_MAP[s]),
    commuteMinutes: app.commuteMinutes,
    yearsExperience: app.yearsExperience,
    hasFoodPermit: app.hasFoodPermit,
    speaksFrench: app.speaksFrench,
    notes: app.notes,
    status: app.status,
    createdAt: app.createdAt.toISOString(),
  };
}

export async function pushApplicationsToArsimatrix(
  applications: MirokApplicationWire[],
  opts?: {
    task?: string;
    site?: "charlesbourg" | "saint-roch";
    requiredShifts?: Array<"midi" | "soir" | "fermeture" | "weekend">;
  }
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const cfg = loadArsimatrixConfig();
  if (!applications.length) {
    return { ok: false, error: "no_applications" };
  }

  const site = opts?.site ?? applications[0]?.site ?? "charlesbourg";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "mirok-arsimatrix-bridge/0.1.0",
  };
  if (cfg.bridgeSecret) {
    headers.Authorization = `Bearer ${cfg.bridgeSecret}`;
  }

  try {
    const res = await fetch(`${cfg.matrixUrl}/api/v1/connectors/mirok/webhook`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "recruit.application_submitted",
        source: "mirok",
        task:
          opts?.task ??
          `Filtrer ${applications.length} candidature(s) Mirok — shifts soir Bati Cantine`,
        site,
        requiredShifts: opts?.requiredShifts ?? ["soir"],
        applications,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`,
        data,
      };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatArsimatrixBridgeStatus(): string {
  const cfg = loadArsimatrixConfig();
  return [
    "Arsimatrix bridge (Mirok → bati-recruit)",
    `  URL: ${cfg.matrixUrl}`,
    `  Enabled: ${cfg.enabled}`,
    `  Secret: ${cfg.bridgeSecret ? "set" : "open (dev)"}`,
    "",
    "Endpoints Mirok:",
    "  POST /api/careers/apply",
    "  GET  /api/careers/applications?status=PENDING",
    "  POST /api/careers/applications/triage-result",
  ].join("\n");
}
