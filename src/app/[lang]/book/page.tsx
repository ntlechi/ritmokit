import Link from "next/link";
import { notFound } from "next/navigation";
import { BookLayoutHeader } from "@/components/booking/book-chrome";
import { DbErrorBanner } from "@/components/db-error-banner";
import { dna } from "@/lib/design/dna";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { listPublicBookableStudios, publicBookingPath } from "@/lib/public-api/directory";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BookDirectoryPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, { data: studios, dbError }] = await Promise.all([
    getDictionary(lang),
    safeQuery(() => listPublicBookableStudios(), []),
  ]);
  const t = dict.booking;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <BookLayoutHeader lang={lang} kicker={t.kicker} title={t.title} subtitle={t.subtitle} />
      {dbError ? <DbErrorBanner label={dict.common.dbDisconnected} /> : null}
      {studios.length === 0 ? (
        <p className="text-sm text-foreground-muted">{t.emptyDirectory}</p>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t.pickStudio}</h2>
          <ul className="flex flex-col gap-2">
            {studios.map((studio) => (
              <li key={studio.locationId}>
                <Link
                  href={publicBookingPath(lang, studio.organizationSlug, studio.locationSlug)}
                  className={cn(dna.panel, "block p-4 transition hover:border-accent")}
                >
                  <p className="text-base font-semibold">{studio.organizationName}</p>
                  <p className="mt-0.5 text-sm text-foreground-muted">{studio.locationName}</p>
                  <p className="mt-2 text-xs text-foreground-muted">
                    {t.season}: {studio.seasonName}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
