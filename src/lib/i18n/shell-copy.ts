import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Minimal dictionary slice for the persistent shell (Sidebar / Header / MobileNav).
 * Avoids shipping the full ~80KB locale object into every client navigation.
 */
export type ShellCopy = {
  brand: Dictionary["brand"];
  nav: Dictionary["nav"];
  common: Pick<
    Dictionary["common"],
    "menu" | "logout" | "loading" | "collapseSidebar" | "expandSidebar" | "resizeSidebar"
  >;
  roles: Dictionary["roles"];
  settings: Pick<Dictionary["settings"], "themeLight" | "themeDark" | "themeSystem" | "admin">;
  profile: Pick<Dictionary["profile"], "title">;
};

export function toShellCopy(dict: Dictionary): ShellCopy {
  return {
    brand: dict.brand,
    nav: dict.nav,
    common: {
      menu: dict.common.menu,
      logout: dict.common.logout,
      loading: dict.common.loading,
      collapseSidebar: dict.common.collapseSidebar,
      expandSidebar: dict.common.expandSidebar,
      resizeSidebar: dict.common.resizeSidebar,
    },
    roles: dict.roles,
    settings: {
      themeLight: dict.settings.themeLight,
      themeDark: dict.settings.themeDark,
      themeSystem: dict.settings.themeSystem,
      admin: dict.settings.admin,
    },
    profile: { title: dict.profile.title },
  };
}
