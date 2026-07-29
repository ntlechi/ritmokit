/**
 * Liens vidéo de formation — YouTube et Vimeo. On ne stocke que l'URL saisie
 * par l'auteur : aucun fichier n'est hébergé par RitmoKit, donc aucun coût de
 * stockage ni de bande passante côté Supabase.
 */
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_PATTERN = /^\d{6,12}$/;

export type VideoProvider = "youtube" | "vimeo";

export type VideoRef = {
  provider: VideoProvider;
  id: string;
  /** Vimeo « unlisted » : le hash est requis pour lire la vidéo privée. */
  hash?: string;
};

export function extractYouTubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = parsed.pathname.slice(1).split("/")[0] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") {
      candidate = parsed.searchParams.get("v");
    } else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
      candidate = parsed.pathname.split("/")[2] ?? null;
    }
  }

  return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Accepte vimeo.com/123456789, vimeo.com/123456789/abcdef123 (non répertoriée)
 * et player.vimeo.com/video/123456789?h=abcdef123.
 */
export function extractVimeoRef(url: string): { id: string; hash?: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  const videoIndex = segments[0] === "video" ? 1 : 0;
  const id = segments[videoIndex];
  if (!id || !VIMEO_ID_PATTERN.test(id)) return null;

  const hash = parsed.searchParams.get("h") ?? segments[videoIndex + 1] ?? undefined;
  return hash && /^[A-Za-z0-9]{6,16}$/.test(hash) ? { id, hash } : { id };
}

/** `null` si le lien n'est pas une vidéo reconnue — sert aussi de validation. */
export function parseVideoUrl(url: string): VideoRef | null {
  const youTubeId = extractYouTubeId(url);
  if (youTubeId) return { provider: "youtube", id: youTubeId };

  const vimeo = extractVimeoRef(url);
  if (vimeo) return { provider: "vimeo", id: vimeo.id, hash: vimeo.hash };

  return null;
}

/** URL d'intégration sans cookies — conforme vie privée, chargement léger. */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

export function vimeoEmbedUrl(videoId: string, hash?: string): string {
  const query = new URLSearchParams({ dnt: "1", title: "0", byline: "0", portrait: "0" });
  if (hash) query.set("h", hash);
  return `https://player.vimeo.com/video/${videoId}?${query.toString()}`;
}

export function videoEmbedUrl(ref: VideoRef): string {
  return ref.provider === "youtube"
    ? youTubeEmbedUrl(ref.id)
    : vimeoEmbedUrl(ref.id, ref.hash);
}

/** Vignette haute résolution servie par YouTube (fallback hqdefault). */
export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Vimeo n'expose pas de vignette par URL déterministe (il faut l'API oEmbed),
 * donc on retourne `null` et le lecteur affiche son propre fond.
 */
export function videoThumbnailUrl(ref: VideoRef): string | null {
  return ref.provider === "youtube" ? youTubeThumbnailUrl(ref.id) : null;
}
