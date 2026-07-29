import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/** Brand alias — Cockpit lives at /dashboard. */
export default async function CockpitAliasPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isLocale(lang) ? `/${lang}/dashboard` : "/fr/dashboard");
}
