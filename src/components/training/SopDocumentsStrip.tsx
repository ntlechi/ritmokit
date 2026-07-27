import Link from "next/link";
import { Check, FileText } from "lucide-react";
import type { FormationCatalog } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function SopDocumentsStrip({
  catalog,
  lang,
  dict,
}: {
  catalog: FormationCatalog;
  lang: Locale;
  dict: Dictionary;
}) {
  const docs = catalog.sections
    .flatMap((s) => s.modules)
    .filter((m) => m.requiresSignature || m.kind === "SAFETY" || m.kind === "ONBOARDING")
    .slice(0, 6);

  if (docs.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">{dict.training.documentsTitle}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => {
          const done = doc.status === "COMPLETED";
          return (
            <Link
              key={doc.id}
              href={`/${lang}/sops/${doc.id}`}
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xs transition hover:shadow-sm",
                "border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-900/60",
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5">
                <FileText className="h-4 w-4 text-foreground-muted" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.title}</p>
                <p className="text-[11px] text-foreground-muted">{dict.training.kind[doc.kind]}</p>
              </div>
              {done ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <Check className="h-3 w-3" aria-hidden />
                  {dict.training.readDone}
                </span>
              ) : (
                <span className="rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {dict.training.signCta}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
