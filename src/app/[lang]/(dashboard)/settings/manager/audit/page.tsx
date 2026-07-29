import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/** Studio safety audit scope — CNESST HR exports remain in audit module. */
export default async function RetiredAuditPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isLocale(lang) ? `/${lang}/settings/manager` : "/fr/settings/manager");
}
