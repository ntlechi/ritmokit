"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { parseVideoUrl, videoEmbedUrl, videoThumbnailUrl } from "@/lib/training/video";

/**
 * Lecteur « façade » YouTube/Vimeo : on affiche la vignette + bouton play, et
 * l'iframe n'est injectée qu'au clic. Zéro JS tiers au chargement — la page
 * SOP reste instantanée même sur le réseau du plancher.
 */
export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const [activated, setActivated] = useState(false);
  const ref = parseVideoUrl(url);
  if (!ref) return null;

  if (activated) {
    const separator = videoEmbedUrl(ref).includes("?") ? "&" : "?";
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
        <iframe
          src={`${videoEmbedUrl(ref)}${separator}autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  const thumbnail = videoThumbnailUrl(ref);

  return (
    <button
      type="button"
      onClick={() => setActivated(true)}
      className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black text-left"
      aria-label={title}
    >
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- vignette externe, pas d'optimisation Next requise
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity duration-200 group-hover:opacity-100"
        />
      ) : (
        <span
          className="absolute inset-0 bg-gradient-to-br from-zinc-700 via-zinc-900 to-black"
          aria-hidden
        />
      )}
      <span
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
        aria-hidden
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
          <Play className="ml-0.5 h-6 w-6 fill-current text-zinc-900" aria-hidden />
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 truncate px-4 pb-3 text-xs font-medium text-white/90">
        {title}
      </span>
    </button>
  );
}
