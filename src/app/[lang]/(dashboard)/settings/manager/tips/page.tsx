import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/** QSR tips pool retired in RitmoKit — redirect to manager hub. */
export default async function RetiredTipsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isLocale(lang) ? `/${lang}/settings/manager` : "/fr/settings/manager");
}
