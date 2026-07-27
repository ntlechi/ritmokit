import { notFound, redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { FranchiseJourneyDemo } from "@/components/onboarding/journey/franchise-journey-demo";
import { DbErrorBanner } from "@/components/db-error-banner";
import { getSessionUser, canAccessManagerSettings } from "@/lib/auth/session";
import { getEmployeeOnboardingState } from "@/lib/data/hr-onboarding";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ demo?: string; day?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);

  if (sp.demo === "1") {
    if (!canAccessManagerSettings(user.role) && user.role !== "EMPLOYEE") {
      redirect(`/${lang}/calendar`);
    }
    const day = Math.min(5, Math.max(1, Number(sp.day) || 1));
    return (
      <div className="flex flex-1 flex-col items-center px-4 py-6">
        <p className="mb-4 text-center text-xs font-bold uppercase tracking-wider text-foreground-muted">
          Mode démo · parcours J1–J5
        </p>
        <FranchiseJourneyDemo initialDay={day} />
      </div>
    );
  }

  if (user.role !== "EMPLOYEE") {
    redirect(`/${lang}/calendar`);
  }

  const { data: state, dbError } = await safeQuery(
    () => getEmployeeOnboardingState(user.id),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      {dbError && (
        <div className="mx-auto mt-4 w-full max-w-md px-4">
          <DbErrorBanner label={dict.onboarding.dbError} />
        </div>
      )}
      {state && (
        <OnboardingWizard
          lang={lang}
          dict={dict}
          state={state}
          defaultSignature={user.fullName}
        />
      )}
    </div>
  );
}
