import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { PageBodyFallback } from "@/components/errors/page-body-fallback";
import { StudioCockpit } from "@/components/dashboard/dance/studio-cockpit";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getStudioCockpitData } from "@/lib/data/studio-cockpit";
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
      <Suspense fallback={<PageBodyFallback label={dict.studioCockpit.title} />}>
        <StudioCockpitBody lang={lang} userId={user.id} role={user.role} dict={dict} />
      </Suspense>
    </div>
  );
}

async function StudioCockpitBody({
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
  const { data, dbError } = await safeQuery(() => getStudioCockpitData(userId, role), null);

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
      <StudioCockpit lang={lang} data={data} dict={dict} />
    </>
  );
}
