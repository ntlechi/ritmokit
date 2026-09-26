import { redirect, notFound } from "next/navigation";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";

export default async function LangIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const user = await getSessionUser();
  if (user && canAccessManagerSettings(user.role)) redirect(`/${lang}/dashboard`);
  if (user?.role === "INSTRUCTOR") redirect(`/${lang}/teach`);
  if (user?.role === "FRONT_DESK") redirect(`/${lang}/accueil`);
  redirect(`/${lang}/calendar/week`);
}
