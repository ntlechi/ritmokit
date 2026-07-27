import { notFound } from "next/navigation";
import MirokLandingPage from "@/components/marketing/landing-page";
import { isLocale } from "@/lib/i18n/config";

export const metadata = {
  title: "Mirok — Le Franchise OS de la restauration rapide",
  description:
    "Le premier système d'exploitation de franchise conçu pour le QSR : Code Rouge, verrous d'horodateur Wi-Fi, conformité CNESST automatisée et culture d'équipe câblée au clock-out.",
};

export default async function LandingRoute({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <MirokLandingPage />;
}
