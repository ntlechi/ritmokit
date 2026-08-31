import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { AuthCallbackClient } from "./callback-client";

export default async function AuthCallbackPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const dict = await getDictionary(lang);
  return <AuthCallbackClient lang={lang} workingLabel={dict.common.loading} />;
}
