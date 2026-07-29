/**
 * RitmoKit Design DNA — Dance Cockpit
 * Shared class fragments for panels, pills, fields, and chrome.
 * Uses semantic tokens (border/surface/accent) so light + dark stay in sync.
 */

export const dna = {
  panel: "rounded-2xl border border-border bg-surface shadow-xs",
  panelLg: "rounded-3xl border border-border bg-surface shadow-xs",
  glass: "border-border bg-surface-glass backdrop-blur-xl",
  pageHeader: "border-b border-border",
  title: "text-xl font-bold tracking-tight text-foreground",
  subtitle: "mt-1 text-sm text-foreground-muted",
  pillTrack: "inline-flex rounded-full border border-border bg-surface-muted p-1",
  pillActive: "rounded-full bg-accent text-accent-foreground shadow-xs",
  pillIdle: "rounded-full text-foreground-muted hover:text-foreground",
  navActive:
    "rounded-full bg-accent px-3 py-2 text-sm font-medium text-accent-foreground shadow-xs",
  navIdle:
    "rounded-full px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground",
  /** Sidebar / stacked nav rows (rounded-xl, not pill). */
  navItemActive: "rounded-xl bg-accent text-accent-foreground shadow-xs",
  navItemIdle:
    "rounded-xl text-foreground-muted hover:bg-surface-muted hover:text-foreground",
  iconBtn:
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground",
  field:
    "w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20 disabled:opacity-50",
  cta: "inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-xs hover:bg-accent-hover",
  ctaGhost:
    "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted",
  metric: "metric",
  liveBadge:
    "inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-live",
} as const;
