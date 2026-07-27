import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const toneStyles = {
  neutral: "bg-surface-muted text-foreground-muted",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
} as const;

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof toneStyles;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
