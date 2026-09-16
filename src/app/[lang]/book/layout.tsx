import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { isLocale } from "@/lib/i18n/config";

export default async function BookLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <ThemeProvider>
      <div className="premium-shell min-h-screen bg-background pb-safe pt-safe text-foreground">
        {children}
      </div>
    </ThemeProvider>
  );
}
