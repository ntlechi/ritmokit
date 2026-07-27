/**
 * Mirok Design DNA — Modernist Organic / Apple–Claude Era
 * Shared class fragments for panels, pills, fields, and chrome.
 */

export const dna = {
  panel:
    "rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-zinc-900/60",
  panelLg:
    "rounded-3xl border border-zinc-200/80 bg-white shadow-xs dark:border-white/10 dark:bg-zinc-900/60",
  glass:
    "border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/80",
  pageHeader: "border-b border-zinc-200/80 dark:border-white/10",
  title: "text-xl font-bold tracking-tight text-foreground",
  subtitle: "mt-1 text-sm text-foreground-muted",
  pillTrack:
    "inline-flex rounded-full border border-zinc-200/80 bg-zinc-100/80 p-1 dark:border-white/10 dark:bg-white/5",
  pillActive: "rounded-full bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900",
  pillIdle: "rounded-full text-foreground-muted hover:text-foreground",
  navActive: "rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900",
  navIdle:
    "rounded-full px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5",
  field:
    "w-full rounded-xl border border-zinc-200/80 bg-zinc-50 px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:focus:bg-zinc-900 dark:focus:ring-white/15",
  cta: "inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100",
  ctaGhost:
    "inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200/80 bg-white px-4 py-2.5 text-sm font-medium text-foreground hover:bg-zinc-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5",
  metric: "metric",
} as const;
