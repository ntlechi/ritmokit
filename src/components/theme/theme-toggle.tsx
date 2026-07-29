"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "./theme-provider";
import { dna } from "@/lib/design/dna";
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
    <div className={cn(dna.pillTrack, "shadow-xs")}>
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
            theme === value ? dna.pillActive : dna.pillIdle,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{labels[labelKey]}</span>
        </button>
      ))}
    </div>
  );
}
