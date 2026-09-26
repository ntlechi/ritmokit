"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Settings,
  MessagesSquare,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  ContactRound,
  CalendarRange,
  GraduationCap,
  UserPlus,
  BookOpen,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { ShellCopy } from "@/lib/i18n/shell-copy";
import type { Role } from "@/generated/prisma/enums";
import {
  canAccessAccueil,
  canAccessManagerSettings,
  canAccessTeaching,
} from "@/lib/auth/session-client";
import { formatBadge, isNavActive, type NavBadges, type NavKey } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

type MobileItem = {
  key: NavKey;
  href: string;
  icon: typeof Calendar;
  badge?: keyof NavBadges;
};

/** Five thumbs-reach tabs per role — the full menu lives in the sidebar. */
function itemsForRole(role: Role): MobileItem[] {
  if (canAccessManagerSettings(role)) {
    return [
      { key: "cockpit", href: "/dashboard", icon: LayoutDashboard },
      { key: "accueil", href: "/accueil", icon: ClipboardCheck },
      { key: "studentsNew", href: "/students/new", icon: UserPlus, badge: "studentsNew" },
      { key: "planning", href: "/planning", icon: CalendarRange },
      { key: "settings", href: "/settings", icon: Settings },
    ];
  }
  if (canAccessTeaching(role)) {
    return [
      { key: "teach", href: "/teach", icon: GraduationCap },
      { key: "accueil", href: "/accueil", icon: ClipboardCheck },
      { key: "plans", href: "/plans", icon: BookOpen },
      { key: "calendar", href: "/calendar/week", icon: Calendar },
      { key: "messages", href: "/messages", icon: MessagesSquare },
    ];
  }
  if (canAccessAccueil(role)) {
    return [
      { key: "accueil", href: "/accueil", icon: ClipboardCheck },
      { key: "studentsNew", href: "/students/new", icon: UserPlus, badge: "studentsNew" },
      { key: "students", href: "/students", icon: ContactRound },
      { key: "calendar", href: "/calendar/week", icon: Calendar },
      { key: "messages", href: "/messages", icon: MessagesSquare },
    ];
  }
  return [
    { key: "calendar", href: "/calendar/week", icon: Calendar },
    { key: "messages", href: "/messages", icon: MessagesSquare },
    { key: "team", href: "/team", icon: Users },
    { key: "settings", href: "/settings", icon: Settings },
  ];
}

export function MobileNav({
  lang,
  shell,
  role,
  badges,
}: {
  lang: Locale;
  shell: ShellCopy;
  role: Role;
  badges?: NavBadges | null;
}) {
  const pathname = usePathname();
  const items = itemsForRole(role);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface-glass pb-safe backdrop-blur-xl lg:hidden"
      aria-label={shell.common.menu}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5 sm:px-2">
        {items.map(({ key, href, icon: Icon, badge }) => {
          const active = isNavActive(pathname, lang, key, href);
          const count = badge ? (badges?.[badge] ?? 0) : 0;
          const label = shell.nav[key];

          return (
            <Link
              key={key}
              href={`/${lang}${href}`}
              data-interactive
              aria-current={active ? "page" : undefined}
              aria-label={count > 0 ? `${label} (${count})` : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium sm:px-2",
                active ? "text-accent" : "text-foreground-muted",
                (key === "cockpit" || key === "teach") && "font-semibold",
              )}
            >
              {active && (
                <span className="absolute -top-1.5 h-[3px] w-8 rounded-full bg-accent" aria-hidden />
              )}
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden />
                {count > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[9px] font-bold leading-4 text-white tabular-nums">
                    {formatBadge(count)}
                  </span>
                )}
              </span>
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
