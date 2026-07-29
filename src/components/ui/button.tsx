import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variantStyles = {
  primary:
    "bg-accent text-accent-foreground shadow-xs hover:bg-accent-hover",
  secondary:
    "border border-border bg-surface text-foreground shadow-xs backdrop-blur-sm hover:bg-surface-muted",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted",
  danger: "bg-danger/10 text-danger hover:bg-danger/20",
} as const;

const sizeStyles = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
}) {
  return (
    <button
      data-interactive
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium disabled:opacity-40 disabled:pointer-events-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
