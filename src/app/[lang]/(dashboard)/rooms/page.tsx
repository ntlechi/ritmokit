import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6">
      <h1 className="display-title text-xl font-bold tracking-tight">{dict.nav.rooms}</h1>
      <p className="mt-2 max-w-xl text-sm text-foreground-muted">{dict.dance.roomsIntro}</p>
    </div>
  );
}
