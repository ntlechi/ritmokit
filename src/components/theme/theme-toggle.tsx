"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "./theme-provider";
import { cn } from "@/lib/utils";

const options: { value: Theme; icon: typeof Sun; labelKey: "themeLight" | "themeDark" | "themeSystem" }[] = [
  { value: "light", icon: Sun, labelKey: "themeLight" },
  { value: "dark", icon: Moon, labelKey: "themeDark" },
  { value: "system", icon: Monitor, labelKey: "themeSystem" },
];

export function ThemeToggle({
  labels,
}: {
  labels: { themeLight: string; themeDark: string; themeSystem: string };
}) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex rounded-full border border-zinc-200/80 bg-zinc-100/80 p-1 shadow-xs dark:border-white/10 dark:bg-white/5">
      {options.map(({ value, icon: Icon, labelKey }) => (
        <button
          key={value}
          type="button"
          data-interactive
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          aria-label={labels[labelKey]}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
            theme === value
              ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
              : "text-foreground-muted hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{labels[labelKey]}</span>
        </button>
      ))}
    </div>
  );
}
