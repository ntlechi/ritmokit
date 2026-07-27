"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, UserRound } from "lucide-react";
import { openBuddyConversationAction } from "@/lib/actions/hr-excellence";
import type { EmployeeBuddyCard } from "@/lib/data/hr-excellence";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";

function resolveError(dict: Dictionary, code: string): string {
  const map: Record<string, string> = {
    unauthorized: dict.buddy.errors.unauthorized,
    no_location: dict.buddy.errors.noLocation,
    no_buddy: dict.buddy.errors.noBuddy,
    database_error: dict.buddy.errors.databaseError,
  };
  return map[code] ?? dict.buddy.errors.databaseError;
}

export function BuddyCard({
  buddy,
  dict,
  lang,
}: {
  buddy: EmployeeBuddyCard;
  dict: Dictionary;
  lang: Locale;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openChat() {
    setError(null);
    startTransition(async () => {
      const result = await openBuddyConversationAction();
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      if (result.conversationId) {
        router.push(`/${lang}/messages/dm/${result.conversationId}`);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-accent/25 bg-accent/5 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent">
          <UserRound className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{dict.buddy.cardTitle}</p>
          <p className="mt-1 text-sm text-foreground">
            {dict.buddy.cardBody.replace("{name}", buddy.buddyName)}
          </p>
          {buddy.buddyStation && (
            <p className="mt-0.5 text-xs text-foreground-muted">
              {buddy.buddyStation}
            </p>
          )}
          <p className="mt-1 text-xs text-foreground-muted">{dict.buddy.cardHint}</p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <Button
            type="button"
            size="sm"
            className="mt-3 gap-1.5"
            disabled={isPending}
            onClick={openChat}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <MessageCircle className="h-4 w-4" aria-hidden />
            )}
            {isPending ? dict.buddy.openingChat : dict.buddy.messageButton}
          </Button>
        </div>
      </div>
    </section>
  );
}
