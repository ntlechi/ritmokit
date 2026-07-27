"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Shield } from "lucide-react";
import { initializeBatiCultureConstitutionAction } from "@/lib/actions/culture";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";

export function InitCultureConstitutionButton({
  organizationId,
  dict,
}: {
  organizationId: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await initializeBatiCultureConstitutionAction(organizationId);
            if (!result.ok) {
              const map: Record<string, string> = {
                unauthorized: dict.culture.errors.unauthorized,
                organization_not_found: dict.culture.errors.organizationNotFound,
                database_error: dict.culture.errors.databaseError,
              };
              setError(map[result.error] ?? dict.culture.errors.databaseError);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Shield className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        )}
        {dict.culture.initConstitution}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
