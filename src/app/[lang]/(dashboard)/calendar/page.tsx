import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/config";

export default async function CalendarIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  redirect(`/${lang}/calendar/week`);
}
