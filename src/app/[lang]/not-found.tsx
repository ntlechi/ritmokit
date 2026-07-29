import Link from "next/link";
import { dna } from "@/lib/design/dna";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Page introuvable</h1>
      <p className="max-w-sm text-sm text-foreground-muted">
        Cette adresse n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className={dna.cta}
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
