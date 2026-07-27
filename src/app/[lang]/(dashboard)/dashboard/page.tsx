import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { PageBodyFallback } from "@/components/errors/page-body-fallback";
import { OpsDashboard } from "@/components/manager/ops-dashboard";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getManagerOpsDashboard } from "@/lib/data/manager-ops-dashboard";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import type { Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function ManagerDashboardPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user || !canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/calendar/week`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageBodyFallback label={dict.opsDashboard.title} />}>
        <OpsDashboardBody lang={lang} userId={user.id} role={user.role} dict={dict} />
      </Suspense>
    </div>
  );
}

async function OpsDashboardBody({
  lang,
  userId,
  role,
  dict,
}: {
  lang: Locale;
  userId: string;
  role: Role;
  dict: Dictionary;
}) {
  const { data, dbError } = await safeQuery(
    () => getManagerOpsDashboard(userId, role, lang),
    null,
  );

  if (!data) {
    redirect(`/${lang}/settings/manager`);
  }

  return (
    <>
      {dbError && (
        <div className="px-4 pt-4 sm:px-6">
          <DbErrorBanner label={dict.common.dbDisconnected} />
        </div>
      )}
      <OpsDashboard lang={lang} data={data} copy={dict.opsDashboard} dict={dict} />
    </>
  );
}
