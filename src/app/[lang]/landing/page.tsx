import { notFound } from "next/navigation";
import RitmoKitLandingPage from "@/components/marketing/landing-page";
import { isLocale } from "@/lib/i18n/config";

export const metadata = {
  title: "RitmoKit — Le kit d'opérations pour écoles de danse",
  description:
    "Sessions, parité Lead/Follow, salles, Accueil, paie instructeurs et site public — le système d'exploitation pour studios de danse au Québec et en Amérique du Nord.",
};

export default async function LandingRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <RitmoKitLandingPage />;
}
