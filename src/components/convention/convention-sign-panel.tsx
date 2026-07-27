"use client";

import { useState, useTransition } from "react";
import { Check, FileSignature } from "lucide-react";
import { signWorkplaceConventionAction } from "@/lib/actions/workplace-convention";
import type { ConventionSignatureStatus } from "@/lib/data/workplace-convention";
import { getConventionContent } from "@/lib/policy/workplace-convention";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.convention.errors.unauthorized,
    invalid_signature: dict.convention.errors.invalidSignature,
    already_signed: dict.convention.errors.alreadySigned,
    database_error: dict.convention.errors.databaseError,
  };
  return map[code] ?? dict.convention.errors.databaseError;
}

function formatDate(iso: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

export function ConventionSignPanel({
  lang,
  dict,
  status,
  defaultSignature = "",
  onSigned,
}: {
  lang: Locale;
  dict: Dictionary;
  status: ConventionSignatureStatus;
  defaultSignature?: string;
  onSigned?: () => void;
}) {
  const content = getConventionContent(lang);
  const [signature, setSignature] = useState(defaultSignature);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (status.signed && status.signedAt) {
    return (
      <div className="premium-banner p-5" data-tone="emerald">
        <div className="flex items-center gap-2">
          <Check className="h-5 w-5 text-success" aria-hidden />
          <h2 className="text-base font-semibold">{dict.convention.signedTitle}</h2>
        </div>
        <p className="mt-2 text-sm text-foreground-muted">
          {dict.convention.signedAs
            .replace("{name}", status.signatureName ?? "")
            .replace("{date}", formatDate(status.signedAt, lang))}
        </p>
        <p className="mt-1 text-xs text-foreground-muted">
          {dict.convention.versionLabel.replace("{version}", status.version)}
        </p>
      </div>
    );
  }

  function handleSign() {
    setError(null);
    startTransition(async () => {
      const result = await signWorkplaceConventionAction(signature, comment || undefined);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      onSigned?.();
    });
  }

  return (
    <div className="premium-card glow p-5">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-accent" aria-hidden />
        <h2 className="text-base font-semibold">{dict.convention.signTitle}</h2>
      </div>
      <p className="mt-2 text-sm text-foreground-muted">
        {content.signatureStatement.replace("{version}", content.version)}
      </p>

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-muted">{dict.convention.signatureLabel}</span>
        <input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
          placeholder={dict.convention.signaturePlaceholder}
        />
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground-muted">{dict.convention.commentOptional}</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
          placeholder={dict.convention.commentPlaceholder}
        />
      </label>

      <p className="mt-2 text-[11px] text-foreground-muted">{dict.convention.signatureDisclaimer}</p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <Button
        className={cn("mt-4 w-full")}
        disabled={isPending || signature.trim().length < 2}
        onClick={handleSign}
      >
        {isPending ? dict.convention.signing : dict.convention.signCta}
      </Button>
    </div>
  );
}
