"use server";

import { revalidatePath } from "next/cache";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import {
  applyAgentPlaybookSettings,
  type AgentPlaybookName,
  AGENT_PLAYBOOK_NAMES,
} from "@/lib/rsi/playbooks";

export type RsiAgentActionResult = { ok: true } | { ok: false; error: string };

const CULTURE_PATH = "/[lang]/settings/manager/culture";

function isAgentPlaybookName(value: string): value is AgentPlaybookName {
  return (AGENT_PLAYBOOK_NAMES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Gouvernance RSI 2 — le gérant / owner approuve ou rejette un patch de playbook.
 * APPROVED injecte LocationAgentConfig (versionnée) ; jamais d'auto-écriture.
 */
export async function resolveAgentPlaybookProposalAction(
  proposalId: string,
  status: "APPROVED" | "REJECTED",
): Promise<RsiAgentActionResult> {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser || !canAccessManagerSettings(sessionUser.role)) {
      return { ok: false, error: "unauthorized" };
    }

    if (status !== "APPROVED" && status !== "REJECTED") {
      return { ok: false, error: "invalid_status" };
    }

    const proposal = await prisma.agentPlaybookProposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        status: true,
        locationId: true,
        agentName: true,
        proposedConfig: true,
      },
    });
    if (!proposal) return { ok: false, error: "not_found" };
    if (proposal.status !== "SUGGESTED") {
      return { ok: false, error: "already_resolved" };
    }
    if (!isAgentPlaybookName(proposal.agentName)) {
      return { ok: false, error: "invalid_agent" };
    }
    if (!isRecord(proposal.proposedConfig)) {
      return { ok: false, error: "invalid_config" };
    }

    if (sessionUser.role !== "ADMIN") {
      const membership = await prisma.locationMember.findFirst({
        where: { userId: sessionUser.id, locationId: proposal.locationId },
      });
      if (!membership) return { ok: false, error: "unauthorized" };
    }

    await prisma.agentPlaybookProposal.update({
      where: { id: proposalId },
      data: {
        status,
        approvedById: sessionUser.id,
        resolvedAt: new Date(),
      },
    });

    if (status === "APPROVED") {
      await applyAgentPlaybookSettings({
        locationId: proposal.locationId,
        agentName: proposal.agentName,
        settings: proposal.proposedConfig,
        updatedById: sessionUser.id,
      });
    }

    revalidatePath(CULTURE_PATH, "page");
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("rsi-agents", error);
  }
}
