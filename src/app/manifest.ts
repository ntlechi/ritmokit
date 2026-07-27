import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RitmoKit — Opérations pour écoles de danse",
    short_name: "RitmoKit",
    description:
      "Le kit d'opérations pour écoles de danse : sessions, parité, salles, RH et agents IA.",
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
