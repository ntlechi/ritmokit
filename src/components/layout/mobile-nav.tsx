"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Settings,
  MessagesSquare,
  LayoutDashboard,
  Users,
  Music2,
  DoorOpen,
  ClipboardCheck,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { ShellCopy } from "@/lib/i18n/shell-copy";
import type { Role } from "@/generated/prisma/enums";
import { canAccessAccueil, canAccessManagerSettings } from "@/lib/auth/session-client";
import { cn } from "@/lib/utils";

export function MobileNav({
  lang,
  shell,
  role,
}: {
  lang: Locale;
  shell: ShellCopy;
  role: Role;
}) {
  const pathname = usePathname();
  const isManagement = canAccessManagerSettings(role);
  const showAccueil = canAccessAccueil(role);

  const items = isManagement
    ? ([
        { key: "accueil", href: "/accueil", icon: ClipboardCheck, label: shell.nav.accueil },
        { key: "cockpit", href: "/dashboard", icon: LayoutDashboard, label: shell.nav.cockpit },
        { key: "sessions", href: "/sessions", icon: Music2, label: shell.nav.sessions },
        { key: "rooms", href: "/rooms", icon: DoorOpen, label: shell.nav.rooms },
        { key: "team", href: "/team", icon: Users, label: shell.nav.team },
        { key: "settings", href: "/settings", icon: Settings, label: shell.nav.settings },
      ] as const)
    : showAccueil
      ? ([
          { key: "accueil", href: "/accueil", icon: ClipboardCheck, label: shell.nav.accueil },
          { key: "calendar", href: "/calendar/week", icon: Calendar, label: shell.nav.calendar },
          { key: "messages", href: "/messages", icon: MessagesSquare, label: shell.nav.messages },
          { key: "team", href: "/team", icon: Users, label: shell.nav.team },
          { key: "settings", href: "/settings", icon: Settings, label: shell.nav.settings },
        ] as const)
      : ([
          { key: "calendar", href: "/calendar/week", icon: Calendar, label: shell.nav.calendar },
          { key: "sessions", href: "/sessions", icon: Music2, label: shell.nav.sessions },
          { key: "messages", href: "/messages", icon: MessagesSquare, label: shell.nav.messages },
          { key: "rooms", href: "/rooms", icon: DoorOpen, label: shell.nav.rooms },
          { key: "team", href: "/team", icon: Users, label: shell.nav.team },
          { key: "settings", href: "/settings", icon: Settings, label: shell.nav.settings },
        ] as const);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200/80 bg-white/80 pb-safe backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80 lg:hidden"
      aria-label={shell.common.menu}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5 sm:px-2">
        {items.map(({ key, href, icon: Icon, label }) => {
          const fullHref = `/${lang}${href}`;
          const active =
            key === "cockpit"
              ? pathname?.startsWith(`/${lang}/dashboard`) ||
                pathname?.startsWith(`/${lang}/settings/manager`)
              : pathname?.startsWith(fullHref);

          return (
            <Link
              key={key}
              href={fullHref}
              data-interactive
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium sm:px-2",
                active ? "text-foreground" : "text-foreground-muted",
                key === "cockpit" && "font-semibold",
              )}
            >
              {active && (
                <span
                  className="absolute -top-1.5 h-[3px] w-8 rounded-full bg-zinc-900 dark:bg-white"
                  aria-hidden
                />
              )}
              <Icon className="h-5 w-5" aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
