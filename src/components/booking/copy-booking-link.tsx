"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

export function CopyBookingLink({
  href,
  copyLabel,
  copiedLabel,
  openLabel,
}: {
  href: string;
  copyLabel: string;
  copiedLabel: string;
  openLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  function absoluteUrl() {
    if (href.startsWith("http")) return href;
    if (typeof window === "undefined") return href;
    return `${window.location.origin}${href.startsWith("/") ? href : `/${href}`}`;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={href || absoluteUrl()}
        target="_blank"
        rel="noreferrer"
        data-interactive
        className={cn(dna.cta, "min-h-11 px-3 text-xs")}
      >
        {openLabel}
      </a>
      <button
        type="button"
        data-interactive
        className={cn(dna.ctaGhost, "min-h-11 px-3 text-xs")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(absoluteUrl());
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
