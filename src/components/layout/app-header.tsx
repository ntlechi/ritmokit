import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { LogoutButton } from "@/components/layout/logout-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { Locale } from "@/lib/i18n/config";
import type { ShellCopy } from "@/lib/i18n/shell-copy";
import type { SessionUser } from "@/lib/auth/session";
import type { LocationScope } from "@/components/layout/location-scope";
import { LocationSwitcher } from "@/components/layout/location-switcher";

export function AppHeader({
  lang,
  shell,
  user,
  locationScope,
}: {
  lang: Locale;
  shell: ShellCopy;
  user: SessionUser | null;
  locationScope?: LocationScope | null;
}) {
  return (
    <header className="header-hairline sticky top-0 z-40 shrink-0 border-b border-border bg-surface-glass pt-safe backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0 lg:hidden">
          <p className="text-sm font-bold tracking-tight text-foreground">{shell.brand.name}</p>
          {locationScope ? (
            <LocationSwitcher scope={locationScope} label={shell.common.switchSchool} dense />
          ) : user ? (
            <p className="truncate text-xs text-foreground-muted">
              {user.fullName} · {shell.roles[user.role]}
            </p>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href={`/${lang}/help`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={shell.nav.help}
            title={shell.nav.help}
          >
            <LifeBuoy className="h-4 w-4" aria-hidden />
          </Link>
          <LanguageSwitcher lang={lang} />
          <ThemeToggle
            labels={{
              themeLight: shell.settings.themeLight,
              themeDark: shell.settings.themeDark,
              themeSystem: shell.settings.themeSystem,
            }}
          />
          {user && (
            <Link
              href={`/${lang}/settings/profile`}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={shell.profile.title}
              title={shell.profile.title}
            >
              <UserAvatar
                fullName={user.fullName}
                pictureUrl={user.profilePictureUrl}
                stationColorHex={user.stationColorHex}
                size="sm"
              />
            </Link>
          )}
          {user && <LogoutButton label={shell.common.logout} />}
        </div>
      </div>
    </header>
  );
}
