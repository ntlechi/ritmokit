"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Scale, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import { submitTipVoteAction } from "@/lib/actions/tip-votes";
import type { EmployeeVoteBallot } from "@/lib/data/tips";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    no_active_vote: dict.tipVote.errors.noActiveVote,
    only_employees_can_vote: dict.tipVote.errors.onlyEmployees,
    already_voted: dict.tipVote.errors.alreadyVoted,
    invalid_signature: dict.tipVote.errors.invalidSignature,
    database_error: dict.tipVote.errors.databaseError,
    unauthorized: dict.tipVote.errors.onlyEmployees,
  };
  return map[code] ?? dict.tipVote.errors.databaseError;
}

export function TipVoteCard({
  ballot,
  dict,
  defaultSignature = "",
}: {
  ballot: EmployeeVoteBallot;
  dict: Dictionary;
  defaultSignature?: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [signature, setSignature] = useState(defaultSignature);
  const [error, setError] = useState<string | null>(null);
  const [localVoted, setLocalVoted] = useState(ballot.hasVoted);
  const [localVote, setLocalVote] = useState(ballot.userVote);
  const [isPending, startTransition] = useTransition();

  function submit(isApproved: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await submitTipVoteAction(ballot.configId, isApproved, signature);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setLocalVoted(true);
      setLocalVote({ isApproved, signatureName: signature.trim() });
      router.refresh();
    });
  }

  if (localVoted && localVote) {
    return (
      <section className="rounded-2xl border border-success/30 bg-success/5 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-success" aria-hidden />
          <p className="text-sm font-semibold text-success">{dict.tipVote.thankYou}</p>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">
          {localVote.isApproved ? dict.tipVote.votedYes : dict.tipVote.votedNo} ·{" "}
          {dict.tipVote.signedAs.replace("{name}", localVote.signatureName)}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10">
          <Vote className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{dict.tipVote.bannerTitle}</h2>
          <p className="mt-0.5 text-xs text-foreground-muted">{dict.tipVote.bannerSubtitle}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center gap-2 text-left text-xs font-medium text-accent hover:underline"
      >
        <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {dict.tipVote.readAgreement}
      </button>

      {expanded && (
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-foreground-muted">
          {ballot.agreementText}
        </pre>
      )}

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-muted">{dict.tipVote.signatureLabel}</span>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={dict.tipVote.signaturePlaceholder}
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm"
        />
      </label>

      {error && (
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          disabled={isPending || signature.trim().length < 2}
          onClick={() => submit(true)}
        >
          <ThumbsUp className="h-4 w-4" aria-hidden />
          {isPending ? dict.tipVote.submitting : dict.tipVote.voteYes}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className={cn("flex-1")}
          disabled={isPending || signature.trim().length < 2}
          onClick={() => submit(false)}
        >
          <ThumbsDown className="h-4 w-4" aria-hidden />
          {isPending ? dict.tipVote.submitting : dict.tipVote.voteNo}
        </Button>
      </div>
    </section>
  );
}
