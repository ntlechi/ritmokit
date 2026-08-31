import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { AppHeader } from "./app-header";
import type { Locale } from "@/lib/i18n/config";
import type { SessionUser } from "@/lib/auth/session";
import type { ShellCopy } from "@/lib/i18n/shell-copy";
import type { LocationScope } from "@/components/layout/location-scope";

export function AppShell({
  lang,
  shell,
  user,
  locationScope,
  children,
}: {
  lang: Locale;
  shell: ShellCopy;
  user: SessionUser | null;
  locationScope?: LocationScope | null;
  children: ReactNode;
}) {
  const role = user?.role ?? "EMPLOYEE";

  return (
    <div className="premium-shell flex min-h-full flex-1 print:block">
      <Sidebar lang={lang} shell={shell} role={role} locationScope={locationScope} />
      <div className="flex min-h-full min-w-0 flex-1 flex-col pb-nav-safe lg:pb-0 print:block print:pb-0">
        <AppHeader lang={lang} shell={shell} user={user} locationScope={locationScope} />
        <div className="flex flex-1 flex-col print:block">{children}</div>
      </div>
      <MobileNav lang={lang} shell={shell} role={role} />
    </div>
  );
}
