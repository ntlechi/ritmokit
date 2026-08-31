"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MapPin } from "lucide-react";
import { setActiveLocationAction } from "@/lib/actions/active-location";
import type { LocationScope } from "@/components/layout/location-scope";
import { cn } from "@/lib/utils";

export function LocationSwitcher({
  scope,
  label,
  collapsed = false,
  dense = false,
}: {
  scope: LocationScope;
  label: string;
  collapsed?: boolean;
  dense?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticId, setOptimisticId] = useState<string | null>(null);
  const activeId = optimisticId ?? scope.activeId;
  const active = scope.locations.find((row) => row.id === activeId) ?? scope.locations[0];
  const canSwitch = scope.locations.length > 1;

  useEffect(() => {
    setOptimisticId(null);
  }, [scope.activeId]);

  function select(locationId: string) {
    if (locationId === activeId) return;
    setOptimisticId(locationId);
    startTransition(async () => {
      const result = await setActiveLocationAction(locationId);
      if (!result.ok) {
        setOptimisticId(null);
        return;
      }
      router.refresh();
    });
  }

  if (!active) return null;

  if (!canSwitch) {
    return (
      <p
        className={cn(
          "truncate font-medium text-foreground-muted",
          dense ? "text-[10px] leading-4" : "text-[11px]",
          collapsed && "sr-only",
        )}
        title={active.name}
      >
        {active.name}
      </p>
    );
  }

  if (collapsed) {
    return (
      <label className="relative flex h-10 w-10 items-center justify-center">
        <span className="sr-only">{label}</span>
        <MapPin className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />
        <select
          value={activeId}
          disabled={pending}
          aria-label={label}
          onChange={(event) => select(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {scope.locations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.city ? `${row.name} · ${row.city}` : row.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className={cn("relative block min-w-0", !dense && "mt-0.5")}>
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-foreground-muted">
        <ChevronDown className="h-3 w-3" aria-hidden />
      </span>
      <select
        value={activeId}
        disabled={pending}
        aria-label={label}
        onChange={(event) => select(event.target.value)}
        className={cn(
          "w-full cursor-pointer appearance-none truncate bg-transparent pr-4 font-medium text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60",
          dense ? "h-4 text-[10px] leading-4" : "min-h-11 text-[11px]",
        )}
      >
        {scope.locations.map((row) => (
          <option key={row.id} value={row.id}>
            {row.city ? `${row.name} · ${row.city}` : row.name}
          </option>
        ))}
      </select>
    </label>
  );
}
