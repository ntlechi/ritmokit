"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const views = [
  { key: "month", segment: "month" },
  { key: "week", segment: "week" },
  { key: "day", segment: "day" },
  { key: "mobile", segment: "mobile" },
] as const;

export function ViewSwitcher({
  dict,
  lang,
  isManager = false,
}: {
  dict: Dictionary;
  lang: Locale;
  isManager?: boolean;
}) {
  const pathname = usePathname();
  const managerHref = `/${lang}/calendar/manager/schedule`;
  const onManagerSchedule = pathname?.startsWith(managerHref);

  return (
    <div
      role="tablist"
      aria-label={dict.calendar.title}
      className="inline-flex flex-wrap gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/5"
    >
      {views.map((view) => {
        const href = `/${lang}/calendar/${view.segment}`;
        const active = !onManagerSchedule && pathname?.startsWith(href);

        return (
          <Link
            key={view.key}
            href={href}
            role="tab"
            aria-selected={active}
            data-interactive
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium",
              active
                ? "bg-white text-foreground shadow-xs dark:bg-zinc-900"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            {dict.calendar.views[view.key]}
          </Link>
        );
      })}
      {isManager && (
        <Link
          href={managerHref}
          role="tab"
          aria-selected={onManagerSchedule}
          data-interactive
          className={cn(
            "rounded-full px-3.5 py-1.5 text-sm font-medium",
            onManagerSchedule
              ? "bg-white text-foreground shadow-xs dark:bg-zinc-900"
              : "text-foreground-muted hover:text-foreground",
          )}
        >
          {dict.calendar.views.schedule}
        </Link>
      )}
    </div>
  );
}
