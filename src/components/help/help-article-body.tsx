import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { Dictionary, HelpTopicCopy } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * Corps d'une fiche d'aide, partagé entre l'accordéon du centre d'aide et la
 * page dédiée — une seule mise en forme des étapes à maintenir.
 */
export function HelpArticleBody({
  topic,
  dict,
  ctaHref,
  className,
}: {
  topic: HelpTopicCopy;
  dict: Dictionary;
  ctaHref: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      <p className="max-w-2xl text-sm leading-relaxed text-foreground-muted">{topic.whatIs}</p>

      <div>
        <p className="premium-eyebrow">{dict.help.howTo}</p>
        <ol className="mt-3 space-y-2.5">
          {topic.steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="metric mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-bold text-white dark:bg-white dark:text-zinc-900">
                {index + 1}
              </span>
              <span className="max-w-2xl pt-0.5 text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {topic.tip && (
        <div className="premium-banner flex gap-2.5" data-tone="amber">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="max-w-2xl text-sm leading-relaxed">{topic.tip}</p>
        </div>
      )}

      <Link
        href={ctaHref}
        className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {topic.ctaLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
