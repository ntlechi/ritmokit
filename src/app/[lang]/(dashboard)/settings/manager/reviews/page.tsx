import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { ManagerReviewsDashboard } from "@/components/reviews/manager-reviews-dashboard";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getManagerReviewsDashboard } from "@/lib/data/reviews";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ManagerReviewsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user || !canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/settings`);
  }

  const { data: dashboard, dbError } = await safeQuery(
    () => getManagerReviewsDashboard(user.id, user.role),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <Link
          href={`/${lang}/settings/manager`}
          className="text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          ← {dict.settings.manager}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.reviews.managerTitle}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.reviews.managerSubtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {dbError && <DbErrorBanner label={dict.reviews.errors.databaseError} />}
        {dashboard && (
          <ManagerReviewsDashboard
            reviews={dashboard.reviews}
            dict={dict}
            lang={lang}
            defaultSignature={user.fullName}
          />
        )}
      </div>
    </div>
  );
}
