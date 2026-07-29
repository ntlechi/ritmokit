import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/** Staffing targets by department — redirect to manager hub (studio defaults in schedule sidebar). */
export default async function RetiredStaffingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isLocale(lang) ? `/${lang}/settings/manager` : "/fr/settings/manager");
}
