import Link from "next/link";
import { locales } from "@/lib/i18n/config";

export function BookLayoutHeader({
  lang,
  kicker,
  title,
  subtitle,
  studioName,
  pathAfterLang,
}: {
  lang: string;
  kicker: string;
  title: string;
  subtitle: string;
  studioName?: string;
  pathAfterLang?: string;
}) {
  const suffix = pathAfterLang ?? "/book";
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/${lang}/book`} className="text-sm font-semibold tracking-tight">
          RitmoKit
        </Link>
        <nav className="flex gap-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
          {locales.map((locale) => (
            <Link
              key={locale}
              href={`/${locale}${suffix}`}
              className={locale === lang ? "text-accent" : "hover:text-foreground"}
            >
              {locale}
            </Link>
          ))}
        </nav>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{kicker}</p>
        <h1 className="display-title mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {studioName ? <p className="mt-1 text-sm font-medium">{studioName}</p> : null}
        <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
      </div>
    </header>
  );
}
