import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { ViewSwitcher } from "@/components/calendar/view-switcher";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";

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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80 sm:px-6 sm:py-4">
        <div className="flex items-center gap-4">
          <h1 className="display-title text-xl font-bold tracking-tight">{dict.calendar.title}</h1>
          <ViewSwitcher dict={dict} lang={lang} isManager={isManager} />
        </div>
        {isManager && (
          <Link
            href={`/${lang}/calendar/manager/schedule`}
            data-interactive
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 text-sm font-medium text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {dict.calendar.newShift}
          </Link>
        )}
      </header>
      <main className="flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
