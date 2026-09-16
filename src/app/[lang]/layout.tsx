import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DisableServiceWorker } from "@/components/pwa/disable-service-worker";
import { PINNED_DARK_PATH_SOURCE } from "@/lib/theme/pinned-surfaces";
import { isLocale, locales } from "@/lib/i18n/config";
import "../globals.css";

// Inter carries UI copy, names and syllabi; JetBrains Mono carries operational
// telemetry (ratios, times, RK| tickets, amounts). Variable names are kept so
// globals.css `--font-sans` / `--font-mono` keep resolving.
const interSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const APP_NAME = "RitmoKit";
const APP_DEFAULT_TITLE = "RitmoKit — Opérations pour écoles de danse";
const APP_TITLE_TEMPLATE = "%s · RitmoKit";
const APP_DESCRIPTION =
  "Le kit d'opérations pour écoles de danse : sessions, parité, salles, RH et agents IA.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_DEFAULT_TITLE,
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

/**
 * Applique le thème stocké AVANT la première peinture — élimine le flash
 * clair→sombre et les rendus hybrides. Doit rester du JS ES5 inline minimal.
 * Les surfaces porte (/accueil, /tablet) sont épinglées en sombre quel que
 * soit le réglage utilisateur — même regex que `pinned-surfaces.ts`.
 */
const THEME_INIT_SCRIPT = `(function(){try{if(new RegExp(${JSON.stringify(PINNED_DARK_PATH_SOURCE)}).test(location.pathname)){document.documentElement.setAttribute("data-theme","dark");return;}var t=localStorage.getItem("ritmokit-theme")||localStorage.getItem("mirok-theme")||"dark";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;document.documentElement.setAttribute("data-theme",r==="dark"?"dark":"light");}catch(e){}})();`;

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html
      lang={lang}
      data-theme="dark"
      className={`${interSans.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased bg-background text-foreground">
        <Script
          id="ritmokit-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <DisableServiceWorker />
        {children}
      </body>
    </html>
  );
}
