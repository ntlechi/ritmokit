import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { HelpStepMockup } from "@/components/help/help-step-mockup";
import { AccueilCheatSheetPrint } from "@/components/help/accueil-cheat-sheet";
import { getSessionUser } from "@/lib/auth/session";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function AccueilCheatSheetPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  const role = user?.role ?? "EMPLOYEE";
  const sheet = dict.help.cheatSheet;

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6 print:p-0">
      <div className="mx-auto w-full max-w-2xl print:max-w-none">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href={`/${lang}/help`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {dict.help.backToHub}
          </Link>
          <AccueilCheatSheetPrint label={sheet.printButton} />
        </div>

        <article className="premium-card overflow-hidden p-6 sm:p-8 print:border-0 print:shadow-none print:p-8">
          <header className="border-b border-border pb-5 print:border-black/20">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent print:text-black">
              {sheet.badge}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight print:text-3xl">{sheet.title}</h1>
            <p className="mt-2 text-sm text-foreground-muted print:text-base print:text-black/80">
              {sheet.subtitle}
            </p>
          </header>

          <AccueilCheatSheetPrint label={sheet.printButton} className="mt-4 hidden print:inline-flex" />

          <ol className="mt-6 space-y-4">
            {sheet.steps.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground print:border-2 print:border-black print:bg-white print:text-black">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed print:text-base">{step}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
            <HelpStepMockup variant="accueil-tap" caption={dict.help.mockups.accueilTap} />
            <HelpStepMockup variant="accueil-filters" caption={dict.help.mockups.accueilFilters} />
          </div>

          <div className="mt-8 rounded-2xl bg-surface-muted p-4 print:border print:border-black/20 print:bg-white">
            <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted print:text-black">
              {sheet.remindersTitle}
            </p>
            <ul className="mt-2 space-y-1.5">
              {sheet.reminders.map((line) => (
                <li key={line} className="text-sm leading-snug print:text-base">
                  · {line}
                </li>
              ))}
            </ul>
          </div>

          {role === "FRONT_DESK" || role === "MANAGER" || role === "OWNER" || role === "ADMIN" ? (
            <p className="mt-6 text-center text-xs text-foreground-muted print:mt-8 print:text-sm">
              {sheet.footer} ·{" "}
              <span className="font-semibold">{dict.brand.name}</span>
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
