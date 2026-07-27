"use client";

import { RouteError } from "@/components/errors/route-error";

export default function CalendarError({
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
      title="Calendrier indisponible"
      description="Impossible de charger l'horaire. Réessayez dans un instant."
    />
  );
}
