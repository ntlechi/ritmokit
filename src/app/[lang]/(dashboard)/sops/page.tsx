import Link from "next/link";
import { Suspense } from "react";
import { Settings2 } from "lucide-react";
import { notFound } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { PageBodyFallback } from "@/components/errors/page-body-fallback";
import { TrainingPortal } from "@/components/training/TrainingPortal";
import { canManageTrainingCatalog, getSessionUser } from "@/lib/auth/session";
import { getFormationCatalogForUser } from "@/lib/data/training";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

const emptyCatalog = {
  primaryStationId: null,
  stations: [],
  categories: [],
  sections: [],
  totalLessons: 0,
  completedLessons: 0,
  seniorityDays: 0,
  resumeModule: null,
};

export default async function SopsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);

  if (!user) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="border-b border-zinc-200/80 px-4 py-4 dark:border-white/10 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight">{dict.training.centerTitle}</h1>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
          <DbErrorBanner label={dict.training.signInRequired} />
        </main>
      </div>
    );
  }

  const canManage = canManageTrainingCatalog(user.role);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50/50 dark:bg-transparent">
      <header className="border-b border-zinc-200/80 px-4 py-4 dark:border-white/10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.training.centerTitle}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.training.subtitle}</p>
          </div>
          {canManage && (
            <Link
              href={`/${lang}/settings/training`}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-white/5"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              {dict.training.manageCatalog}
            </Link>
          )}
        </div>
      </header>
      <Suspense fallback={<PageBodyFallback label={dict.training.title} />}>
        <TrainingPortalBody lang={lang} dict={dict} userId={user.id} canManage={canManage} />
      </Suspense>
    </div>
  );
}

async function TrainingPortalBody({
  lang,
  dict,
  userId,
  canManage,
}: {
  lang: Locale;
  dict: Dictionary;
  userId: string;
  canManage: boolean;
}) {
  const { data: catalog, dbError } = await safeQuery(
    () => getFormationCatalogForUser(userId),
    emptyCatalog,
  );

  return (
    <>
      {dbError && (
        <div className="px-4 pt-4 sm:px-6">
          <DbErrorBanner label={dict.training.dbError} />
        </div>
      )}
      <TrainingPortal
        lang={lang}
        dict={dict}
        catalog={catalog}
        canManage={canManage}
        hidePageTitle
      />
    </>
  );
}
