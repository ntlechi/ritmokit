import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { getSessionUser } from "@/lib/auth/session";
import { getEmployeeOnboardingState } from "@/lib/data/hr-onboarding";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { toShellCopy } from "@/lib/i18n/shell-copy";
import { isLocale } from "@/lib/i18n/config";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  // Overlap dictionary work with onboarding once session resolves (employee path).
  const userPromise = getSessionUser();
  const dictPromise = getDictionary(lang);
  const user = await userPromise;
  const isEmployee = user?.role === "EMPLOYEE";
  const [dict, { data: onboardingState }] = await Promise.all([
    dictPromise,
    safeQuery(
      () => (user && isEmployee ? getEmployeeOnboardingState(user.id) : Promise.resolve(null)),
      null,
    ),
  ]);
  const shell = toShellCopy(dict);
  const onboardingComplete =
    !isEmployee ||
    Boolean(
      onboardingState?.step1Complete &&
        onboardingState?.step2Complete &&
        onboardingState?.step3Complete,
    );

  return (
    <ThemeProvider>
      <AppShell lang={lang} shell={shell} user={user}>
        <OnboardingGate lang={lang} complete={onboardingComplete} isEmployee={isEmployee}>
          {children}
        </OnboardingGate>
      </AppShell>
    </ThemeProvider>
  );
}
