"use client";

import { RouteError } from "@/components/errors/route-error";

export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Messages indisponibles"
      description="La conversation n'a pas pu s'afficher. Réessayez."
    />
  );
}
