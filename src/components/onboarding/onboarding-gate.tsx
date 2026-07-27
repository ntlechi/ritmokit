"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/config";

export function OnboardingGate({
  lang,
  complete,
  isEmployee,
  children,
}: {
  lang: Locale;
  complete: boolean;
  isEmployee: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isEmployee) return;

    const exemptSegments = ["/onboarding", "/sops", "/help"];
    const isExempt = exemptSegments.some((segment) => pathname.includes(segment));
    const onOnboarding = pathname.includes("/onboarding");

    if (!complete && !isExempt) {
      router.replace(`/${lang}/onboarding`);
      return;
    }

    if (complete && onOnboarding) {
      router.replace(`/${lang}/calendar/mobile`);
    }
  }, [complete, isEmployee, lang, pathname, router]);

  return children;
}
