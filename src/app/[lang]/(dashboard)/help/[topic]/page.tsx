import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { HelpArticleBody } from "@/components/help/help-article-body";
import { HELP_CATEGORY_ICONS, HELP_TOPIC_ICONS } from "@/components/help/help-icons";
import { HelpTopicSeen } from "@/components/help/help-topic-seen";
import { getSessionUser } from "@/lib/auth/session";
import { isHelpTopicKey, topicMeta, topicsForRole } from "@/lib/help/config";
import { estimateReadMinutes } from "@/lib/help/search";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function HelpTopicPage({
  params,
}: {
  params: Promise<{ lang: string; topic: string }>;
}) {
  const { lang, topic } = await params;
  if (!isLocale(lang)) notFound();
  if (!isHelpTopicKey(topic)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  const role = user?.role ?? "EMPLOYEE";
  const visible = topicsForRole(role);
  if (!visible.some((t) => t.key === topic)) notFound();

  const meta = topicMeta(topic);
  const copy = dict.help.topics[topic];
  const Icon = HELP_TOPIC_ICONS[topic];
  const CategoryIcon = HELP_CATEGORY_ICONS[meta.category];
  const related = visible.filter((t) => t.category === meta.category && t.key !== topic);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <HelpTopicSeen topicKey={topic} />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Link
          href={`/${lang}/help`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {dict.help.backToHub}
        </Link>

        <article className="premium-card p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground-muted">
            <CategoryIcon className="h-3.5 w-3.5" aria-hidden />
            <span>{dict.help.categories[meta.category]}</span>
            <span aria-hidden>·</span>
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            <span className="metric">
              {dict.help.readMinutes.replace("{count}", String(estimateReadMinutes(copy)))}
            </span>
          </div>

          <div className="mt-4 flex items-start gap-3.5">
            <span className="premium-icon shrink-0">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
              <p className="mt-1 text-sm text-foreground-muted">{copy.tagline}</p>
            </div>
          </div>

          <HelpArticleBody
            topic={copy}
            topicKey={topic}
            dict={dict}
            ctaHref={meta.href(lang)}
            className="mt-6 border-t border-border pt-6"
          />
        </article>

        {related.length > 0 && (
          <section className="premium-card p-5">
            <h2 className="premium-eyebrow">{dict.help.relatedTitle}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {related.map((item) => {
                const RelatedIcon = HELP_TOPIC_ICONS[item.key];
                const relatedCopy = dict.help.topics[item.key];
                return (
                  <li key={item.key}>
                    <Link
                      href={`/${lang}/help/${item.key}`}
                      className="flex h-full items-center gap-3 rounded-xl bg-surface-muted px-4 py-3 transition-colors hover:bg-surface-muted/70"
                    >
                      <RelatedIcon
                        className="h-4 w-4 shrink-0 text-foreground-muted"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                          {relatedCopy.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-foreground-muted">
                          {relatedCopy.tagline}
                        </span>
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-foreground-muted/70"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
