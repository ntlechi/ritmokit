import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variantStyles = {
  primary:
    "bg-zinc-900 text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
  secondary:
    "border border-zinc-200/80 bg-white text-foreground shadow-xs backdrop-blur-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/60",
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
