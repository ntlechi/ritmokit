"use client";

import { Button } from "@/components/ui/button";

/** Shared client error UI for App Router `error.tsx` segments. */
export function RouteError({
  error,
  reset,
  title = "Une erreur s'est produite",
  description = "Réessayez — si le problème continue, contactez le support.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="max-w-sm space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-foreground-muted">{description}</p>
        {error.digest ? (
          <p className="font-mono text-xs text-foreground-muted">réf. {error.digest}</p>
        ) : null}
      </div>
      <Button type="button" variant="primary" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
