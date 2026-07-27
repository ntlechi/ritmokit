import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/** QSR food-cost tracking retired in RitmoKit — redirect to manager hub. */
export default async function RetiredFoodCostPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isLocale(lang) ? `/${lang}/settings/manager` : "/fr/settings/manager");
}
