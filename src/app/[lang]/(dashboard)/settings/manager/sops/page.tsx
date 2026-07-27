import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

/**
 * L'atelier de formation a déménagé sous `/settings/training` (propriétaires
 * et administrateurs). On conserve cette route pour les liens existants.
 */
export default async function ManagerSopsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  redirect(`/${lang}/settings/training`);
}
