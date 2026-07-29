/** Lightweight segment loading skeleton for App Router `loading.tsx`. */
export function RouteLoading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden
      />
      <p className="text-sm text-foreground-muted">{label}</p>
    </div>
  );
}
