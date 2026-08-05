"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Clock3,
  HelpCircle,
  Loader2,
  MessagesSquare,
  Printer,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import type { HelpSupportContact } from "@/lib/data/help-support";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import {
  HELP_FAQ_CATEGORIES,
  categoriesForRole,
  popularForRole,
  quickStartForRole,
  topicMeta,
  topicsForRole,
  type HelpCategoryKey,
  type HelpTopicKey,
} from "@/lib/help/config";
import { changelogForRole, formatChangelogMonth } from "@/lib/help/changelog";
import { markHelpTopicOpened, useRecentHelpTopics } from "@/lib/help/recent";
import { estimateReadMinutes, searchHelp, type HelpSearchResult } from "@/lib/help/search";
import { startDirectConversationAction } from "@/lib/actions/chat";
import { HELP_CATEGORY_ICONS, HELP_TOPIC_ICONS } from "@/components/help/help-icons";
import { HelpArticleBody } from "@/components/help/help-article-body";
import { UserAvatar } from "@/components/ui/user-avatar";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

type ArticleId = { kind: "topic"; key: HelpTopicKey } | { kind: "faq"; index: number };

function sameArticle(a: ArticleId | null, b: ArticleId): boolean {
  if (!a) return false;
  if (a.kind === "topic" && b.kind === "topic") return a.key === b.key;
  if (a.kind === "faq" && b.kind === "faq") return a.index === b.index;
  return false;
}

export function HelpCenter({
  dict,
  lang,
  role,
  locationName,
  supportContact,
}: {
  dict: Dictionary;
  lang: Locale;
  role: Role;
  locationName: string | null;
  supportContact: HelpSupportContact | null;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<HelpCategoryKey | null>(null);
  const [openArticle, setOpenArticle] = useState<ArticleId | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const recent = useRecentHelpTopics();
  const categories = useMemo(() => categoriesForRole(role), [role]);
  const quickStart = useMemo(() => quickStartForRole(role), [role]);
  const changelog = useMemo(() => changelogForRole(role), [role]);
  const visibleCategoryKeys = useMemo(
    () => new Set(categories.map((group) => group.key)),
    [categories],
  );

  const trimmed = query.trim();
  const results = useMemo(
    () => (trimmed.length >= 2 ? searchHelp(dict, role, trimmed) : []),
    [dict, role, trimmed],
  );
  const searching = trimmed.length >= 2;

  // ⌘K / Ctrl+K amène toujours au champ de recherche, comme ailleurs dans l'outil.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const openTopicArticle = useCallback((key: HelpTopicKey) => {
    setOpenArticle((current) =>
      sameArticle(current, { kind: "topic", key }) ? null : { kind: "topic", key },
    );
    markHelpTopicOpened(key);
  }, []);

  const shownCategories = activeCategory
    ? categories.filter((group) => group.key === activeCategory)
    : categories;

  const faqIndexes = dict.help.faq
    .map((_, index) => index)
    .filter((index) => {
      const category = HELP_FAQ_CATEGORIES[index] ?? "team";
      if (!visibleCategoryKeys.has(category)) return false;
      return activeCategory ? category === activeCategory : true;
    });

  return (
    <div className="flex flex-col gap-4">
      <SearchHero
        dict={dict}
        role={role}
        locationName={locationName}
        query={query}
        onQueryChange={setQuery}
        inputRef={inputRef}
        onPickPopular={(key) => {
          setQuery(dict.help.topics[key].title);
          setActiveCategory(null);
        }}
      />

      {searching ? (
        <ResultsPanel
          dict={dict}
          lang={lang}
          query={trimmed}
          results={results}
          supportContact={supportContact}
          onClear={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          onOpenTopic={(key) => markHelpTopicOpened(key)}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[248px_minmax(0,1fr)_320px]">
          <TopicRail
            dict={dict}
            categories={categories}
            activeCategory={activeCategory}
            onSelect={(key) => {
              setActiveCategory(key);
              setOpenArticle(null);
            }}
          />

          <div className="flex min-w-0 flex-col gap-4">
            <QuickStart
              dict={dict}
              lang={lang}
              keys={quickStart}
              seen={recent}
              onOpen={openTopicArticle}
            />

            {shownCategories.map((group, groupIndex) => (
              // La clé inclut le filtre : choisir une catégorie la rouvre, même
              // si l'utilisateur l'avait refermée juste avant.
              <CategoryCard
                key={`${group.key}:${activeCategory ?? "all"}`}
                dict={dict}
                lang={lang}
                categoryKey={group.key}
                topicKeys={group.topics.map((topic) => topic.key)}
                defaultOpen={groupIndex === 0 || activeCategory !== null}
                openArticle={openArticle}
                onToggleArticle={openTopicArticle}
              />
            ))}

            {faqIndexes.length > 0 && (
              <FaqCard
                dict={dict}
                indexes={faqIndexes}
                openArticle={openArticle}
                onToggle={(index) =>
                  setOpenArticle((current) =>
                    sameArticle(current, { kind: "faq", index }) ? null : { kind: "faq", index },
                  )
                }
              />
            )}
          </div>

          <div className="flex flex-col gap-4">
            <SupportPanel dict={dict} lang={lang} contact={supportContact} />
            <RecentPanel dict={dict} lang={lang} recent={recent} />
            <ChangelogPanel dict={dict} lang={lang} entries={changelog} />
          </div>
        </div>
      )}
    </div>
  );
}

function SearchHero({
  dict,
  role,
  locationName,
  query,
  onQueryChange,
  inputRef,
  onPickPopular,
}: {
  dict: Dictionary;
  role: Role;
  locationName: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPickPopular: (key: HelpTopicKey) => void;
}) {
  const popular = popularForRole(role);
  const allowed = new Set(topicsForRole(role).map((topic) => topic.key));

  return (
    <section className="relative overflow-hidden rounded-3xl bg-accent px-6 py-8 text-accent-foreground sm:px-10 sm:py-10">
      {/* Éclat froid en coin — la palette RitmoKit est encre, pas néon. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-40 h-[26rem] w-[26rem] rounded-full"
        style={{
          background: "radial-gradient(circle, rgb(255 255 255 / 0.13), transparent 70%)",
        }}
      />
      <div className="relative max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground/70">
          {locationName ? `${dict.help.title} · ${locationName}` : dict.help.title}
        </p>
        <h1 className="mt-2.5 text-2xl font-bold tracking-tight sm:text-4xl">
          {dict.help.searchTitle}
        </h1>
        <p className="mt-2 text-sm text-accent-foreground/70 sm:text-base">{dict.help.searchSubtitle}</p>

        <div className="mt-6 flex items-center gap-3 rounded-full bg-surface py-2 pl-5 pr-2 shadow-2xl shadow-black/30">
          <Search className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={dict.help.searchPlaceholder}
            aria-label={dict.help.searchAction}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-foreground-muted sm:text-base"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className={dna.iconBtn}
              aria-label={dict.help.clearSearch}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <kbd className="metric hidden shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-foreground-muted sm:inline-block">
              ⌘K
            </kbd>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-foreground/60">
            {dict.help.popularLabel}
          </span>
          {popular
            .filter((key) => allowed.has(key))
            .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onPickPopular(key)}
                className="rounded-full bg-accent-foreground/10 px-3.5 py-1.5 text-xs font-medium text-accent-foreground/90 transition-colors hover:bg-accent-foreground/20 hover:text-accent-foreground"
              >
                {dict.help.topics[key].title}
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}

function ResultsPanel({
  dict,
  lang,
  query,
  results,
  supportContact,
  onClear,
  onOpenTopic,
}: {
  dict: Dictionary;
  lang: Locale;
  query: string;
  results: HelpSearchResult[];
  supportContact: HelpSupportContact | null;
  onClear: () => void;
  onOpenTopic: (key: HelpTopicKey) => void;
}) {
  return (
    <section className="premium-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="premium-eyebrow">
          {dict.help.resultsCount.replace("{count}", String(results.length))}
        </p>
        <p className="text-sm font-semibold">
          {dict.help.resultsFor} « {query} »
        </p>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-foreground-muted sm:inline">
            {dict.help.roleFilterNote}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted"
          >
            {dict.help.clearSearch}
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <HelpCircle className="mx-auto h-6 w-6 text-foreground-muted" aria-hidden />
          <p className="mt-3 text-sm font-semibold">
            {dict.help.resultsEmpty.replace("{query}", query)}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-foreground-muted">
            {dict.help.resultsEmptyHint}
          </p>
          {supportContact && (
            <ManagerButton
              dict={dict}
              lang={lang}
              contact={supportContact}
              className="mt-5 justify-center"
            />
          )}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {results.map((result, index) => (
            <li key={result.id}>
              {result.kind === "topic" ? (
                <Link
                  href={`/${lang}/help/${result.topicKey}`}
                  onClick={() => onOpenTopic(result.topicKey)}
                  className={cn(
                    "flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-colors",
                    index === 0
                      ? "border-2 border-border bg-surface shadow-sm hover:bg-surface-muted/50"
                      : "bg-surface-muted hover:bg-surface-muted/70",
                  )}
                >
                  <ResultBadge label={index === 0 ? dict.help.bestMatch : dict.help.kindTopic} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{result.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                      {dict.help.categories[result.category]} ·{" "}
                      {dict.help.readMinutes.replace("{count}", String(result.readMinutes))}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 text-xs font-semibold text-accent sm:flex">
                    {dict.help.openGuide}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </Link>
              ) : (
                <div className="rounded-2xl bg-surface-muted px-4 py-3.5">
                  <div className="flex items-start gap-3.5">
                    <ResultBadge label={dict.help.kindFaq} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{result.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
                        {result.snippet}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Repli animé via `grid-template-rows`. `inert` retire le contenu replié du
 * focus clavier et des lecteurs d'écran — sans lui, les CTA de chaque fiche
 * fermée restent tabulables alors qu'ils sont invisibles.
 */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

function ResultBadge({ label }: { label: string }) {
  return (
    <span className={cn("shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em]", dna.pillActive)}>
      {label}
    </span>
  );
}

function TopicRail({
  dict,
  categories,
  activeCategory,
  onSelect,
}: {
  dict: Dictionary;
  categories: ReturnType<typeof categoriesForRole>;
  activeCategory: HelpCategoryKey | null;
  onSelect: (key: HelpCategoryKey | null) => void;
}) {
  return (
    <aside className="premium-card h-fit p-3 xl:sticky xl:top-4">
      <p className="premium-eyebrow px-2 pt-1">{dict.help.topicsLabel}</p>
      <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
        <RailItem
          label={dict.help.allTopics}
          count={null}
          active={activeCategory === null}
          onClick={() => onSelect(null)}
          icon={<Sparkles className="h-4 w-4" aria-hidden />}
        />
        {categories.map((group) => {
          const Icon = HELP_CATEGORY_ICONS[group.key];
          return (
            <RailItem
              key={group.key}
              label={dict.help.categories[group.key]}
              count={group.topics.length}
              active={activeCategory === group.key}
              onClick={() => onSelect(group.key)}
              icon={<Icon className="h-4 w-4" aria-hidden />}
            />
          );
        })}
      </nav>
      <p className="mt-3 border-t border-border px-2 pt-3 text-[11px] leading-relaxed text-foreground-muted">
        {dict.help.roleFilterNote}
      </p>
    </aside>
  );
}

function RailItem({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors xl:w-full",
        active
          ? dna.navItemActive
          : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <span className={cn("shrink-0", active ? "" : "text-foreground-muted")}>{icon}</span>
      <span className="truncate">{label}</span>
      {count !== null && (
        <span
          className={cn(
            "metric ml-auto hidden text-[11px] xl:inline",
            active ? "opacity-70" : "text-foreground-muted/70",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function QuickStart({
  dict,
  lang,
  keys,
  seen,
  onOpen,
}: {
  dict: Dictionary;
  lang: Locale;
  keys: HelpTopicKey[];
  seen: readonly HelpTopicKey[];
  onOpen: (key: HelpTopicKey) => void;
}) {
  const seenCount = keys.filter((key) => seen.includes(key)).length;

  return (
    <section className="premium-card p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-bold tracking-tight">{dict.help.quickStartTitle}</h2>
        <p className="text-xs text-foreground-muted">{dict.help.quickStartSubtitle}</p>
        <span
          className={cn(
            "ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold",
            seenCount === keys.length
              ? "bg-success/10 text-success"
              : "bg-surface-muted text-foreground-muted",
          )}
        >
          {dict.help.quickStartProgress
            .replace("{seen}", String(seenCount))
            .replace("{total}", String(keys.length))}
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {keys.map((key) => {
          const topic = dict.help.topics[key];
          const Icon = HELP_TOPIC_ICONS[key];
          const isSeen = seen.includes(key);
          return (
            <Link
              key={key}
              href={`/${lang}/help/${key}`}
              onClick={() => onOpen(key)}
              className={cn(
                "group flex flex-col rounded-2xl border px-4 py-3.5 transition-colors",
                isSeen
                  ? "border-transparent bg-surface-muted hover:bg-surface-muted/70"
                  : "border-border bg-surface shadow-xs hover:bg-surface-muted/60",
              )}
            >
              <Icon
                className={cn("h-5 w-5", isSeen ? "text-foreground-muted" : "text-accent")}
                aria-hidden
              />
              <span className="mt-2.5 text-[13px] font-bold leading-tight">{topic.title}</span>
              <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-foreground-muted">
                {topic.tagline}
              </span>
              <span
                className={cn(
                  "mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold",
                  isSeen ? "text-success" : "text-accent",
                )}
              >
                {isSeen ? (
                  <>
                    <Check className="h-3 w-3" aria-hidden />
                    {dict.help.seenLabel}
                  </>
                ) : (
                  <>
                    {dict.help.toReadLabel}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function CategoryCard({
  dict,
  lang,
  categoryKey,
  topicKeys,
  defaultOpen,
  openArticle,
  onToggleArticle,
}: {
  dict: Dictionary;
  lang: Locale;
  categoryKey: HelpCategoryKey;
  topicKeys: HelpTopicKey[];
  defaultOpen: boolean;
  openArticle: ArticleId | null;
  onToggleArticle: (key: HelpTopicKey) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = HELP_CATEGORY_ICONS[categoryKey];

  return (
    <section className="premium-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-muted"
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-foreground-muted" aria-hidden />
        <span className="text-base font-bold tracking-tight">
          {dict.help.categories[categoryKey]}
        </span>
        <span className="text-xs text-foreground-muted">
          {dict.help.articlesCount.replace("{count}", String(topicKeys.length))}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <Collapsible open={open}>
        <ul className="border-t border-border">
            {topicKeys.map((key) => {
              const topic = dict.help.topics[key];
              const expanded = sameArticle(openArticle, { kind: "topic", key });
              return (
                <li key={key} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onToggleArticle(key)}
                    aria-expanded={expanded}
                    className={cn(
                      "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors",
                      expanded ? "bg-surface-muted/60" : "hover:bg-surface-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {topic.title}
                      </span>
                      {!expanded && (
                        <span className="mt-0.5 block truncate text-[11px] text-foreground-muted">
                          {topic.tagline}
                        </span>
                      )}
                    </span>
                    <span className="metric shrink-0 text-[11px] text-foreground-muted/70">
                      {dict.help.readMinutes.replace(
                        "{count}",
                        String(estimateReadMinutes(topic)),
                      )}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-200",
                        expanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>

                  <Collapsible open={expanded}>
                    <div className="bg-surface-muted/40 px-5 pb-5 pt-1">
                      <HelpArticleBody
                        topic={topic}
                        topicKey={key}
                        dict={dict}
                        ctaHref={topicMeta(key).href(lang)}
                      />
                      <Link
                        href={`/${lang}/help/${key}`}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground"
                      >
                        <BookOpen className="h-3.5 w-3.5" aria-hidden />
                        {dict.help.openGuide}
                      </Link>
                    </div>
                  </Collapsible>
                </li>
              );
            })}
        </ul>
      </Collapsible>
    </section>
  );
}

function FaqCard({
  dict,
  indexes,
  openArticle,
  onToggle,
}: {
  dict: Dictionary;
  indexes: number[];
  openArticle: ArticleId | null;
  onToggle: (index: number) => void;
}) {
  return (
    <section className="premium-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <HelpCircle className="h-[18px] w-[18px] shrink-0 text-foreground-muted" aria-hidden />
        <h2 className="text-base font-bold tracking-tight">{dict.help.faqTitle}</h2>
      </div>
      <ul className="border-t border-border">
        {indexes.map((index) => {
          const item = dict.help.faq[index];
          const expanded = sameArticle(openArticle, { kind: "faq", index });
          return (
            <li key={item.q} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onToggle(index)}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors",
                  expanded ? "bg-surface-muted/60" : "hover:bg-surface-muted",
                )}
              >
                <span className="min-w-0 flex-1 text-[13px] font-semibold">{item.q}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-foreground-muted transition-transform duration-200",
                    expanded && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              <Collapsible open={expanded}>
                <p className="max-w-2xl px-5 pb-4 text-sm leading-relaxed text-foreground-muted">
                  {item.a}
                </p>
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SupportPanel({
  dict,
  lang,
  contact,
}: {
  dict: Dictionary;
  lang: Locale;
  contact: HelpSupportContact | null;
}) {
  return (
    <section className="rounded-2xl border-2 border-accent/25 bg-surface p-5 shadow-sm">
      <h2 className="text-[15px] font-bold tracking-tight">{dict.help.supportTitle}</h2>
      <p className="mt-1 text-xs text-foreground-muted">{dict.help.supportSubtitle}</p>

      <div className="mt-4 flex flex-col gap-2.5">
        {contact ? (
          <ManagerButton dict={dict} lang={lang} contact={contact} />
        ) : (
          <p className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-foreground-muted">
            {dict.help.supportManagerMissing}
          </p>
        )}

        <SupportLink
          href={`/${lang}/help/feuille-accueil`}
          icon={<Printer className="h-[18px] w-[18px]" aria-hidden />}
          title={dict.help.studioSetup.printSheet}
          hint={dict.help.cheatSheet.subtitle}
        />
        <SupportLink
          href={`/${lang}/messages`}
          icon={<MessagesSquare className="h-[18px] w-[18px]" aria-hidden />}
          title={dict.help.supportMessages}
          hint={dict.help.supportMessagesHint}
        />
        <SupportLink
          href={`/${lang}/sops`}
          icon={<BookOpen className="h-[18px] w-[18px]" aria-hidden />}
          title={dict.help.supportTraining}
          hint={dict.help.supportTrainingHint}
        />
      </div>
    </section>
  );
}

function ManagerButton({
  dict,
  lang,
  contact,
  className,
}: {
  dict: Dictionary;
  lang: Locale;
  contact: HelpSupportContact;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function openConversation() {
    setError(false);
    startTransition(async () => {
      const result = await startDirectConversationAction({ lang, peerUserId: contact.userId });
      if (result.ok) {
        router.push(`/${lang}/messages/dm/${result.conversationId}`);
        return;
      }
      setError(true);
    });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={openConversation}
        disabled={pending}
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors disabled:opacity-70",
          "bg-accent text-accent-foreground hover:bg-accent-hover",
        )}
      >
        <UserAvatar fullName={contact.fullName} pictureUrl={contact.profilePictureUrl} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold">
            {dict.help.supportManager.replace("{name}", contact.fullName)}
          </span>
          <span className="mt-0.5 block truncate text-[11px] opacity-70">
            {pending ? dict.help.supportOpening : dict.help.supportMessagesHint}
          </span>
        </span>
        {pending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </button>
      {error && <p className="text-[11px] font-medium text-danger">{dict.help.supportError}</p>}
    </div>
  );
}

function SupportLink({
  href,
  icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl bg-surface-muted px-4 py-3 transition-colors hover:bg-surface-muted/70"
    >
      <span className="shrink-0 text-foreground-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-foreground-muted">{hint}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-foreground-muted/70" aria-hidden />
    </Link>
  );
}

function RecentPanel({
  dict,
  lang,
  recent,
}: {
  dict: Dictionary;
  lang: Locale;
  recent: readonly HelpTopicKey[];
}) {
  return (
    <section className="premium-card p-5">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-foreground-muted" aria-hidden />
        <h2 className="text-[15px] font-bold tracking-tight">{dict.help.recentTitle}</h2>
      </div>

      {recent.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-foreground-muted">{dict.help.recentEmpty}</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {recent.map((key) => {
            const topic = dict.help.topics[key];
            const Icon = HELP_TOPIC_ICONS[key];
            return (
              <li key={key} className="border-b border-border last:border-b-0">
                <Link
                  href={`/${lang}/help/${key}`}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:opacity-70"
                >
                  <Icon className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{topic.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-foreground-muted">
                      {dict.help.categories[topicMeta(key).category]} ·{" "}
                      {dict.help.readMinutes.replace(
                        "{count}",
                        String(estimateReadMinutes(topic)),
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ChangelogPanel({
  dict,
  lang,
  entries,
}: {
  dict: Dictionary;
  lang: Locale;
  entries: ReturnType<typeof changelogForRole>;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="premium-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="text-[15px] font-bold tracking-tight">{dict.help.changelogTitle}</h2>
      </div>

      <ul className="mt-3.5 flex flex-col gap-3.5">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className={index > 0 ? "border-t border-border pt-3.5" : undefined}
          >
            {index === 0 && (
              <div className="mb-1.5 flex items-center gap-2">
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-accent-foreground">
                  {dict.help.changelogNew}
                </span>
                <span className="text-[11px] text-foreground-muted/70">
                  {formatChangelogMonth(entry.month, lang)}
                </span>
              </div>
            )}
            <Link href={entry.href(lang)} className="group block">
              <span className="block text-[13px] font-bold group-hover:text-accent">
                {entry.title[lang]}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-foreground-muted">
                {entry.body[lang]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
