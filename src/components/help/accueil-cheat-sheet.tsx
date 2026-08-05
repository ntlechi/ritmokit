"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccueilCheatSheetPrint({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-accent-foreground print:hidden",
        className,
      )}
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
