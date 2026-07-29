import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/** Retired module — redirects to manager hub. */
export default async function RetiredArsiPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isLocale(lang) ? `/${lang}/settings/manager` : "/fr/settings/manager");
}
