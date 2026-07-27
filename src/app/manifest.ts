import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mirok — Gestion RH & Horaires",
    short_name: "Mirok",
    description:
      "Gestion RH et d'horaires nouvelle génération, conforme CNESST, pensée pour l'ère agentique.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0b0b0c",
    lang: "fr-CA",
    icons: [
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
