import { cn } from "@/lib/utils";

export type HelpMockupVariant = "paypal" | "season" | "accueil-tap" | "accueil-filters";

export function HelpStepMockup({
  variant,
  caption,
  className,
}: {
  variant: HelpMockupVariant;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={cn("overflow-hidden rounded-2xl border border-border bg-surface-muted", className)}>
      <div className="border-b border-border bg-surface px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Aperçu</p>
      </div>
      <div className="p-4">{renderMockup(variant)}</div>
      {caption && (
        <figcaption className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-foreground-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function renderMockup(variant: HelpMockupVariant) {
  switch (variant) {
    case "paypal":
      return (
        <div className="space-y-2 text-left">
          <p className="text-xs font-bold">PayPal</p>
          <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[11px] text-foreground-muted">
            Identifiant client · ••••••••
          </div>
          <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[11px] text-foreground-muted">
            Mot secret · ••••••••
          </div>
          <span className="inline-block rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground">
            Essayer la connexion
          </span>
        </div>
      );
    case "season":
      return (
        <div className="space-y-2 text-left">
          <p className="text-xs font-bold">Automne 2026</p>
          <span className="inline-block rounded-full bg-success/15 px-2.5 py-0.5 text-[10px] font-semibold text-success">
            Publié
          </span>
          <p className="text-[11px] text-foreground-muted">12 cours · inscriptions ouvertes</p>
        </div>
      );
    case "accueil-tap":
      return (
        <div className="space-y-2 text-left">
          <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/10 px-3 py-2">
            <div>
              <p className="text-[11px] font-semibold">Marie L. · Follow</p>
              <p className="text-[10px] text-success">Payé</p>
            </div>
            <span className="rounded-full bg-success px-2.5 py-1 text-[10px] font-bold text-white">Présent</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 opacity-80">
            <div>
              <p className="text-[11px] font-semibold">Jean P. · Lead</p>
              <p className="text-[10px] text-foreground-muted">Pas payé</p>
            </div>
            <span className="rounded-full border border-accent px-2.5 py-1 text-[10px] font-semibold text-accent">
              Présent
            </span>
          </div>
        </div>
      );
    case "accueil-filters":
      return (
        <div className="flex flex-wrap gap-1.5">
          {["Tous", "Pas payé", "Liste d'attente", "À pointer"].map((label, index) => (
            <span
              key={label}
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-medium",
                index === 1 ? "bg-accent text-accent-foreground" : "bg-surface text-foreground-muted border border-border",
              )}
            >
              {label}
            </span>
          ))}
        </div>
      );
  }
}

/** Mockups shown under specific help topics (hub + article pages). */
export const HELP_TOPIC_MOCKUPS: Partial<
  Record<string, { variant: HelpMockupVariant; captionKey?: string }[]>
> = {
  gettingStarted: [
    { variant: "paypal" },
    { variant: "season" },
    { variant: "accueil-tap" },
  ],
  accueil: [{ variant: "accueil-tap" }, { variant: "accueil-filters" }],
};
