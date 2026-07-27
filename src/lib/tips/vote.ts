import "server-only";

import type { VoteStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/** Quorum LNT : majorité absolue des employés de la succursale (50 % + 1). */
export function requiredVotesToPass(totalEmployees: number): number {
  return Math.floor(totalEmployees / 2) + 1;
}

export async function countEligibleEmployeeVoters(locationId: string): Promise<number> {
  return prisma.locationMember.count({
    where: { locationId, user: { role: "EMPLOYEE" } },
  });
}

export type VoteTally = {
  totalEmployees: number;
  votesCast: number;
  yesVotes: number;
  noVotes: number;
  requiredToPass: number;
  isApproved: boolean;
  isRejected: boolean;
};

export function tallyVotes(totalEmployees: number, votes: Array<{ isApproved: boolean }>): VoteTally {
  const yesVotes = votes.filter((v) => v.isApproved).length;
  const noVotes = votes.length - yesVotes;
  const requiredToPass = requiredVotesToPass(totalEmployees);
  const isApproved = yesVotes >= requiredToPass;
  const isRejected = votes.length === totalEmployees && !isApproved;

  return {
    totalEmployees,
    votesCast: votes.length,
    yesVotes,
    noVotes,
    requiredToPass,
    isApproved,
    isRejected,
  };
}

export async function resolveVoteOutcome(configId: string): Promise<VoteStatus | null> {
  const config = await prisma.tipPoolConfig.findUnique({
    where: { id: configId },
    select: { id: true, locationId: true, status: true },
  });
  if (!config || config.status !== "VOTING") return null;

  const [totalEmployees, votes] = await Promise.all([
    countEligibleEmployeeVoters(config.locationId),
    prisma.tipPoolVote.findMany({ where: { configId }, select: { isApproved: true } }),
  ]);

  if (totalEmployees === 0) return null;

  const result = tallyVotes(totalEmployees, votes);
  if (result.isApproved) return "APPROVED";
  if (result.isRejected) return "REJECTED";
  return null;
}

export async function applyVoteOutcome(configId: string): Promise<VoteStatus | null> {
  const outcome = await resolveVoteOutcome(configId);
  if (!outcome || outcome === "VOTING") return null;

  await prisma.tipPoolConfig.update({
    where: { id: configId },
    data: {
      status: outcome,
      isActive: outcome === "APPROVED",
      votedAt: outcome === "APPROVED" ? new Date() : null,
    },
  });

  return outcome;
}
