import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { AppHeader } from "./app-header";
import type { Locale } from "@/lib/i18n/config";
import type { SessionUser } from "@/lib/auth/session";
import type { ShellCopy } from "@/lib/i18n/shell-copy";

export function AppShell({
  lang,
  shell,
  user,
  children,
}: {
  lang: Locale;
  shell: ShellCopy;
  user: SessionUser | null;
  children: ReactNode;
}) {
  const role = user?.role ?? "EMPLOYEE";

  return (
    <div className="premium-shell flex min-h-full flex-1">
      <Sidebar lang={lang} shell={shell} role={role} />
      <div className="flex min-h-full min-w-0 flex-1 flex-col pb-nav-safe lg:pb-0">
        <AppHeader lang={lang} shell={shell} user={user} />
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
      <MobileNav lang={lang} shell={shell} role={role} />
    </div>
  );
}
