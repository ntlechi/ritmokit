import { notFound, redirect } from "next/navigation";
import { TimeOffRequestsPanel } from "@/components/team/time-off-requests-panel";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { safeQuery } from "@/lib/data/safe";
import { getPendingTimeOffForManager } from "@/lib/data/timeoff";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function TeamRequestsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.common.loading}</div>;
  }

  if (!canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/team`);
  }

  const { data: pending, dbError } = await safeQuery(
    () => getPendingTimeOffForManager(user.id),
    [],
  );

  if (dbError) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.timeOff.errors.databaseError}</p>
      </div>
    );
  }

  return <TimeOffRequestsPanel lang={lang} dict={dict} initialPending={pending} />;
}
