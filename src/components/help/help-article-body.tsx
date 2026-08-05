import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { HelpTopicKey } from "@/lib/help/config";
import { HELP_TOPIC_MOCKUPS, HelpStepMockup } from "@/components/help/help-step-mockup";
import type { Dictionary, HelpTopicCopy } from "@/lib/i18n/dictionaries";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

const MOCKUP_CAPTIONS: Record<string, keyof Dictionary["help"]["mockups"]> = {
  paypal: "paypal",
  season: "season",
  "accueil-tap": "accueilTap",
  "accueil-filters": "accueilFilters",
};

/**
 * Corps d'une fiche d'aide, partagé entre l'accordéon du centre d'aide et la
 * page dédiée — une seule mise en forme des étapes à maintenir.
 */
export function HelpArticleBody({
  topic,
  topicKey,
  dict,
  ctaHref,
  className,
}: {
  topic: HelpTopicCopy;
  topicKey?: HelpTopicKey;
  dict: Dictionary;
  ctaHref: string;
  className?: string;
}) {
  const mockups = topicKey ? HELP_TOPIC_MOCKUPS[topicKey] : undefined;

  return (
    <div className={cn("space-y-5", className)}>
      <p className="max-w-2xl text-sm leading-relaxed text-foreground-muted">{topic.whatIs}</p>

      {mockups && mockups.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {mockups.map(({ variant }) => (
            <HelpStepMockup
              key={variant}
              variant={variant}
              caption={dict.help.mockups[MOCKUP_CAPTIONS[variant]]}
            />
          ))}
        </div>
      )}

      <div>
        <p className="premium-eyebrow">{dict.help.howTo}</p>
        <ol className="mt-3 space-y-2.5">
          {topic.steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className={cn("metric mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[11px] font-bold", dna.pillActive)}>
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

      <Link href={ctaHref} className={dna.cta}>
        {topic.ctaLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
