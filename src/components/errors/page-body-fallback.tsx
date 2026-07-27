/** Inline Suspense fallback while a heavy page body streams. */
export function PageBodyFallback({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-8 w-56 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-zinc-200/80 bg-zinc-100/80 dark:border-white/10 dark:bg-zinc-800/50"
          />
        ))}
      </div>
      <p className="sr-only">{label}</p>
    </div>
  );
}
