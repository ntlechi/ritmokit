import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Clés stables — jamais de freestyle LLM sur les noms d'agents. */
export const AGENT_PLAYBOOK_NAMES = [
  "CRISIS_REPLACEMENT",
  "CNESST_GUARD",
  "LATE_ARRIVAL",
  "LABOR_COST",
  "CODE_RED_SURGE",
  "PULSE_CULTURE",
  "ASSIDUITY",
  "TOKEN_SAFEGUARD",
  "DRIFT_GUARD",
] as const;

export type AgentPlaybookName = (typeof AGENT_PLAYBOOK_NAMES)[number];

export type CrisisPlaybookSettings = {
  allowCrossStation: boolean;
  preferSameStationFirst: boolean;
  minCandidatesBeforeWiden: number;
};

export type CnesstGuardPlaybookSettings = {
  alertOnMissedBreak: boolean;
  alertOnShortBreak: boolean;
};

export type LateArrivalPlaybookSettings = {
  windowBeforeHours: number;
  windowAfterHours: number;
};

/** Autopilot — labor cost target (class revenue intraday). */
export type LaborCostPlaybookSettings = {
  targetLaborPct: number;
  tolerancePct: number;
  /** Heures à surveiller pour sur-effectif (0–23). */
  watchHours: number[];
};

/** Autopilot — crisis-shift surge bonus defaults + fill-time target. */
export type CodeRedSurgePlaybookSettings = {
  defaultSurgeBonus: number;
  targetFillSeconds: number;
  maxSurgeBonus: number;
};

/** Autopilot — cible Pulse moyenne + relance formation station. */
export type PulseCulturePlaybookSettings = {
  targetPulseScore: number;
  enableStationCoaching: boolean;
};

/** Autopilot Loop D — tampons d'horaire pour retards récurrents. */
export type AssiduityPlaybookSettings = {
  lateThresholdMinutes: number;
  minLateOccurrences: number;
  minSampleSize: number;
  minBufferMinutes: number;
  maxBufferMinutes: number;
  lookbackWeeks: number;
  scheduleBuffers: Array<{ userId: string; startHour: number; bufferMinutes: number }>;
};

/** Autopilot Loop E — plafonds compute/tokens + alertes. */
export type TokenSafeguardPlaybookSettings = {
  maxDbQueriesPerLocation: number;
  maxDurationMsPerLocation: number;
  maxTokenBudgetPerLocation: number;
  emitBudgetAlerts: boolean;
};

/** Autopilot Loop F — garde-fou de dérive / decay. */
export type DriftGuardPlaybookSettings = {
  maxSingleStepPct: number;
  blockConsecutiveRaises: boolean;
  decayStableWeeks: number;
  enableDecayProposals: boolean;
};

export type AgentPlaybookSettingsMap = {
  CRISIS_REPLACEMENT: CrisisPlaybookSettings;
  CNESST_GUARD: CnesstGuardPlaybookSettings;
  LATE_ARRIVAL: LateArrivalPlaybookSettings;
  LABOR_COST: LaborCostPlaybookSettings;
  CODE_RED_SURGE: CodeRedSurgePlaybookSettings;
  PULSE_CULTURE: PulseCulturePlaybookSettings;
  ASSIDUITY: AssiduityPlaybookSettings;
  TOKEN_SAFEGUARD: TokenSafeguardPlaybookSettings;
  DRIFT_GUARD: DriftGuardPlaybookSettings;
};

export const DEFAULT_AGENT_PLAYBOOKS: AgentPlaybookSettingsMap = {
  CRISIS_REPLACEMENT: {
    allowCrossStation: false,
    preferSameStationFirst: true,
    minCandidatesBeforeWiden: 0,
  },
  CNESST_GUARD: {
    alertOnMissedBreak: true,
    alertOnShortBreak: true,
  },
  LATE_ARRIVAL: {
    windowBeforeHours: 2,
    windowAfterHours: 6,
  },
  LABOR_COST: {
    targetLaborPct: 22,
    tolerancePct: 1,
    watchHours: [14, 15, 16, 17],
  },
  CODE_RED_SURGE: {
    defaultSurgeBonus: 2.5,
    targetFillSeconds: 180,
    maxSurgeBonus: 5,
  },
  PULSE_CULTURE: {
    targetPulseScore: 4.5,
    enableStationCoaching: true,
  },
  ASSIDUITY: {
    lateThresholdMinutes: 5,
    minLateOccurrences: 3,
    minSampleSize: 5,
    minBufferMinutes: 5,
    maxBufferMinutes: 20,
    lookbackWeeks: 6,
    scheduleBuffers: [],
  },
  TOKEN_SAFEGUARD: {
    maxDbQueriesPerLocation: 200,
    maxDurationMsPerLocation: 15_000,
    maxTokenBudgetPerLocation: 50_000,
    emitBudgetAlerts: true,
  },
  DRIFT_GUARD: {
    maxSingleStepPct: 25,
    blockConsecutiveRaises: true,
    decayStableWeeks: 2,
    enableDecayProposals: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeCrisisSettings(raw: unknown): CrisisPlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.CRISIS_REPLACEMENT };
  if (!isRecord(raw)) return base;
  return {
    allowCrossStation:
      typeof raw.allowCrossStation === "boolean"
        ? raw.allowCrossStation
        : base.allowCrossStation,
    preferSameStationFirst:
      typeof raw.preferSameStationFirst === "boolean"
        ? raw.preferSameStationFirst
        : base.preferSameStationFirst,
    minCandidatesBeforeWiden:
      typeof raw.minCandidatesBeforeWiden === "number"
        ? Math.max(0, Math.floor(raw.minCandidatesBeforeWiden))
        : base.minCandidatesBeforeWiden,
  };
}

export function mergeCnesstSettings(raw: unknown): CnesstGuardPlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.CNESST_GUARD };
  if (!isRecord(raw)) return base;
  return {
    alertOnMissedBreak:
      typeof raw.alertOnMissedBreak === "boolean"
        ? raw.alertOnMissedBreak
        : base.alertOnMissedBreak,
    alertOnShortBreak:
      typeof raw.alertOnShortBreak === "boolean"
        ? raw.alertOnShortBreak
        : base.alertOnShortBreak,
  };
}

export function mergeLateArrivalSettings(raw: unknown): LateArrivalPlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.LATE_ARRIVAL };
  if (!isRecord(raw)) return base;
  return {
    windowBeforeHours:
      typeof raw.windowBeforeHours === "number"
        ? Math.min(12, Math.max(1, raw.windowBeforeHours))
        : base.windowBeforeHours,
    windowAfterHours:
      typeof raw.windowAfterHours === "number"
        ? Math.min(12, Math.max(1, raw.windowAfterHours))
        : base.windowAfterHours,
  };
}

export function mergeLaborCostSettings(raw: unknown): LaborCostPlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.LABOR_COST };
  if (!isRecord(raw)) return base;
  const watchHours = Array.isArray(raw.watchHours)
    ? raw.watchHours
        .filter((h): h is number => typeof h === "number")
        .map((h) => Math.min(23, Math.max(0, Math.floor(h))))
    : base.watchHours;
  return {
    targetLaborPct:
      typeof raw.targetLaborPct === "number"
        ? Math.min(50, Math.max(10, raw.targetLaborPct))
        : base.targetLaborPct,
    tolerancePct:
      typeof raw.tolerancePct === "number"
        ? Math.min(10, Math.max(0.5, raw.tolerancePct))
        : base.tolerancePct,
    watchHours: watchHours.length > 0 ? watchHours : base.watchHours,
  };
}

export function mergeCodeRedSurgeSettings(raw: unknown): CodeRedSurgePlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.CODE_RED_SURGE };
  if (!isRecord(raw)) return base;
  return {
    defaultSurgeBonus:
      typeof raw.defaultSurgeBonus === "number"
        ? Math.min(base.maxSurgeBonus, Math.max(0, raw.defaultSurgeBonus))
        : base.defaultSurgeBonus,
    targetFillSeconds:
      typeof raw.targetFillSeconds === "number"
        ? Math.min(900, Math.max(60, Math.floor(raw.targetFillSeconds)))
        : base.targetFillSeconds,
    maxSurgeBonus:
      typeof raw.maxSurgeBonus === "number"
        ? Math.min(15, Math.max(1, raw.maxSurgeBonus))
        : base.maxSurgeBonus,
  };
}

export function mergePulseCultureSettings(raw: unknown): PulseCulturePlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.PULSE_CULTURE };
  if (!isRecord(raw)) return base;
  return {
    targetPulseScore:
      typeof raw.targetPulseScore === "number"
        ? Math.min(5, Math.max(3, raw.targetPulseScore))
        : base.targetPulseScore,
    enableStationCoaching:
      typeof raw.enableStationCoaching === "boolean"
        ? raw.enableStationCoaching
        : base.enableStationCoaching,
  };
}

export function mergeAssiduitySettings(raw: unknown): AssiduityPlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.ASSIDUITY };
  if (!isRecord(raw)) return base;
  const scheduleBuffers = Array.isArray(raw.scheduleBuffers)
    ? raw.scheduleBuffers
        .map((row) => {
          if (!isRecord(row)) return null;
          if (typeof row.userId !== "string") return null;
          if (typeof row.startHour !== "number") return null;
          if (typeof row.bufferMinutes !== "number") return null;
          return {
            userId: row.userId,
            startHour: Math.min(23, Math.max(0, Math.floor(row.startHour))),
            bufferMinutes: Math.min(60, Math.max(0, Math.floor(row.bufferMinutes))),
          };
        })
        .filter((row): row is AssiduityPlaybookSettings["scheduleBuffers"][number] => row != null)
    : base.scheduleBuffers;
  return {
    lateThresholdMinutes:
      typeof raw.lateThresholdMinutes === "number"
        ? Math.min(30, Math.max(1, Math.floor(raw.lateThresholdMinutes)))
        : base.lateThresholdMinutes,
    minLateOccurrences:
      typeof raw.minLateOccurrences === "number"
        ? Math.min(20, Math.max(1, Math.floor(raw.minLateOccurrences)))
        : base.minLateOccurrences,
    minSampleSize:
      typeof raw.minSampleSize === "number"
        ? Math.min(30, Math.max(3, Math.floor(raw.minSampleSize)))
        : base.minSampleSize,
    minBufferMinutes:
      typeof raw.minBufferMinutes === "number"
        ? Math.min(30, Math.max(0, Math.floor(raw.minBufferMinutes)))
        : base.minBufferMinutes,
    maxBufferMinutes:
      typeof raw.maxBufferMinutes === "number"
        ? Math.min(60, Math.max(5, Math.floor(raw.maxBufferMinutes)))
        : base.maxBufferMinutes,
    lookbackWeeks:
      typeof raw.lookbackWeeks === "number"
        ? Math.min(12, Math.max(2, Math.floor(raw.lookbackWeeks)))
        : base.lookbackWeeks,
    scheduleBuffers,
  };
}

export function mergeTokenSafeguardSettings(raw: unknown): TokenSafeguardPlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.TOKEN_SAFEGUARD };
  if (!isRecord(raw)) return base;
  return {
    maxDbQueriesPerLocation:
      typeof raw.maxDbQueriesPerLocation === "number"
        ? Math.min(2000, Math.max(20, Math.floor(raw.maxDbQueriesPerLocation)))
        : base.maxDbQueriesPerLocation,
    maxDurationMsPerLocation:
      typeof raw.maxDurationMsPerLocation === "number"
        ? Math.min(120_000, Math.max(2_000, Math.floor(raw.maxDurationMsPerLocation)))
        : base.maxDurationMsPerLocation,
    maxTokenBudgetPerLocation:
      typeof raw.maxTokenBudgetPerLocation === "number"
        ? Math.min(2_000_000, Math.max(1_000, Math.floor(raw.maxTokenBudgetPerLocation)))
        : base.maxTokenBudgetPerLocation,
    emitBudgetAlerts:
      typeof raw.emitBudgetAlerts === "boolean" ? raw.emitBudgetAlerts : base.emitBudgetAlerts,
  };
}

export function mergeDriftGuardSettings(raw: unknown): DriftGuardPlaybookSettings {
  const base = { ...DEFAULT_AGENT_PLAYBOOKS.DRIFT_GUARD };
  if (!isRecord(raw)) return base;
  return {
    maxSingleStepPct:
      typeof raw.maxSingleStepPct === "number"
        ? Math.min(100, Math.max(5, raw.maxSingleStepPct))
        : base.maxSingleStepPct,
    blockConsecutiveRaises:
      typeof raw.blockConsecutiveRaises === "boolean"
        ? raw.blockConsecutiveRaises
        : base.blockConsecutiveRaises,
    decayStableWeeks:
      typeof raw.decayStableWeeks === "number"
        ? Math.min(8, Math.max(1, Math.floor(raw.decayStableWeeks)))
        : base.decayStableWeeks,
    enableDecayProposals:
      typeof raw.enableDecayProposals === "boolean"
        ? raw.enableDecayProposals
        : base.enableDecayProposals,
  };
}

export async function getAgentPlaybookSettings<T extends AgentPlaybookName>(
  locationId: string,
  agentName: T,
): Promise<AgentPlaybookSettingsMap[T]> {
  const row = await prisma.locationAgentConfig.findUnique({
    where: {
      locationId_agentName: { locationId, agentName },
    },
  });

  if (agentName === "CRISIS_REPLACEMENT") {
    return mergeCrisisSettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  if (agentName === "CNESST_GUARD") {
    return mergeCnesstSettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  if (agentName === "LABOR_COST") {
    return mergeLaborCostSettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  if (agentName === "CODE_RED_SURGE") {
    return mergeCodeRedSurgeSettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  if (agentName === "PULSE_CULTURE") {
    return mergePulseCultureSettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  if (agentName === "ASSIDUITY") {
    return mergeAssiduitySettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  if (agentName === "TOKEN_SAFEGUARD") {
    return mergeTokenSafeguardSettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  if (agentName === "DRIFT_GUARD") {
    return mergeDriftGuardSettings(row?.settings) as AgentPlaybookSettingsMap[T];
  }
  return mergeLateArrivalSettings(row?.settings) as AgentPlaybookSettingsMap[T];
}

export async function applyAgentPlaybookSettings(input: {
  locationId: string;
  agentName: AgentPlaybookName;
  settings: Record<string, unknown>;
  updatedById: string;
}): Promise<void> {
  const existing = await prisma.locationAgentConfig.findUnique({
    where: {
      locationId_agentName: {
        locationId: input.locationId,
        agentName: input.agentName,
      },
    },
  });

  const nextVersion = (existing?.version ?? 0) + 1;

  await prisma.locationAgentConfig.upsert({
    where: {
      locationId_agentName: {
        locationId: input.locationId,
        agentName: input.agentName,
      },
    },
    update: {
      settings: input.settings as Prisma.InputJsonValue,
      version: nextVersion,
      updatedById: input.updatedById,
    },
    create: {
      locationId: input.locationId,
      agentName: input.agentName,
      settings: input.settings as Prisma.InputJsonValue,
      version: 1,
      updatedById: input.updatedById,
    },
  });
}
