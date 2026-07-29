import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarRange, Plus } from "lucide-react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { ViewSwitcher } from "@/components/calendar/view-switcher";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { dna } from "@/lib/design/dna";

export default async function CalendarLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  const isManager = Boolean(user && canAccessManagerSettings(user.role));

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <CalendarRange className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                {dict.nav.calendar}
              </p>
              <h1 className="display-title text-xl font-bold tracking-tight">
                {dict.calendar.title}
              </h1>
            </div>
            <ViewSwitcher dict={dict} lang={lang} isManager={isManager} />
          </div>
          {isManager && (
            <Link href={`/${lang}/calendar/manager/schedule`} data-interactive className={dna.cta}>
              <Plus className="h-4 w-4" aria-hidden />
              {dict.calendar.newShift}
            </Link>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
