import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffingSettingsForm } from "@/components/manager/staffing-settings-form";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getStaffingProfilesForUser } from "@/lib/data/staffing";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ManagerStaffingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.common.loading}</div>;
  }

  if (!canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/settings`);
  }

  const { data: result, dbError } = await safeQuery(
    () => getStaffingProfilesForUser(user.id, user.role),
    null,
  );

  if (dbError || !result) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.manager.staffing.errors.databaseError}</p>
        <Link href={`/${lang}/settings/manager`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.manager}
        </Link>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.manager.staffing.errors.unauthorized}</p>
        <Link href={`/${lang}/settings`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.title}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <Link href={`/${lang}/settings/manager`} className="w-fit text-sm text-accent hover:underline">
        ← {dict.settings.manager}
      </Link>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{dict.manager.staffing.title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {dict.manager.staffing.subtitle} · {result.locationName}
        </p>
      </header>
      <StaffingSettingsForm stations={result.stations} profiles={result.profiles} dict={dict} locale={lang} />
    </div>
  );
}
