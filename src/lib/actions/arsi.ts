"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { userCanImportArsi } from "@/lib/data/arsi";
import { importArsiPayload } from "@/lib/arsi/import";
import { arsiImportPayloadSchema } from "@/lib/arsi/types";

const ARSI_PATH = "/[lang]/settings/manager/arsi";
const SOPS_PATH = "/[lang]/sops";
const PUNCH_PATH = "/[lang]/pointeuse";

export type ImportArsiActionResult =
  | {
      ok: true;
      syncLogId: string;
      opsCount: number;
      createdCount: number;
      updatedCount: number;
      invalidatedCount: number;
    }
  | { ok: false; error: string };

function revalidateArsiPaths() {
  revalidatePath(ARSI_PATH, "page");
  revalidatePath(SOPS_PATH, "page");
  revalidatePath(`${SOPS_PATH}/[moduleId]`, "page");
  revalidatePath(PUNCH_PATH, "page");
  revalidatePath("/[lang]/settings/training", "page");
}

export async function importArsiPayloadAction(jsonText: string): Promise<ImportArsiActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || !canAccessManagerSettings(user.role)) {
      return { ok: false, error: "unauthorized" };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch {
      return { ok: false, error: "invalid_json" };
    }

    const parsed = arsiImportPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "invalid_payload" };
    }

    const canImport = await userCanImportArsi(user.id, user.role, parsed.data.organizationId);
    if (!canImport) return { ok: false, error: "unauthorized" };

    const result = await importArsiPayload({
      userId: user.id,
      payload: parsed.data,
      payloadSize: Buffer.byteLength(jsonText, "utf8"),
    });

    revalidateArsiPaths();
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "organization_not_found") return { ok: false, error: "organization_not_found" };
      if (error.message.startsWith("station_required:")) return { ok: false, error: "station_required" };
    }
    return { ok: false, error: "database_error" };
  }
}
