"use client";

import { RouteError } from "@/components/errors/route-error";

export default function DashboardError({
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
      title="Impossible d'afficher cette page"
      description="Un problème est survenu dans l'espace de travail. Réessayez."
    />
  );
}
