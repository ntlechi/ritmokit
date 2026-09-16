/**
 * Surfaces whose theme is pinned regardless of the user's preference.
 *
 * The door tablet (`/accueil`) and the live tablet (`/tablet`) run under dim
 * party lighting on a counter device shared by volunteers; they always render
 * the obsidian surface. The regex source is shared with the inline theme
 * bootstrap script in `src/app/[lang]/layout.tsx` so there is no light→dark
 * flash before hydration.
 */
export const PINNED_DARK_PATH_SOURCE = "^/(fr|en|es)/(accueil|tablet)(/|$)";

const PINNED_DARK_PATH = new RegExp(PINNED_DARK_PATH_SOURCE);

export function isPinnedDarkSurface(pathname: string | null | undefined): boolean {
  return Boolean(pathname && PINNED_DARK_PATH.test(pathname));
}
