import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Page introuvable</h1>
      <p className="max-w-sm text-sm text-foreground-muted">
        Cette adresse n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm text-white dark:bg-white dark:text-zinc-900"
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
