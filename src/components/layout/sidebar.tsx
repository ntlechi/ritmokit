"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Users,
  Settings,
  Sparkles,
  MessagesSquare,
  LifeBuoy,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Music2,
  DoorOpen,
  KeyRound,
  ClipboardCheck,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { ShellCopy } from "@/lib/i18n/shell-copy";
import type { Role } from "@/generated/prisma/enums";
import {
  canAccessAccueil,
  canAccessAdminSettings,
  canAccessManagerSettings,
} from "@/lib/auth/session-client";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

const STORAGE_COLLAPSED = "ritmokit-sidebar-collapsed";
const STORAGE_WIDTH = "ritmokit-sidebar-width";

const COLLAPSED_WIDTH = 72;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;

/** Dance-first order: Cockpit → Accueil → Sessions → Rooms → Calendar → … */
const navItems = [
  { key: "cockpit" as const, href: "/dashboard", icon: LayoutDashboard, managerOnly: true },
  { key: "accueil" as const, href: "/accueil", icon: ClipboardCheck, accueilOnly: true },
  { key: "sessions" as const, href: "/sessions", icon: Music2, managerOnly: true },
  { key: "rooms" as const, href: "/rooms", icon: DoorOpen, managerOnly: true },
  { key: "rentals" as const, href: "/rentals", icon: KeyRound, managerOnly: true },
  { key: "calendar" as const, href: "/calendar/week", icon: Calendar },
  { key: "team" as const, href: "/team", icon: Users },
  { key: "messages" as const, href: "/messages", icon: MessagesSquare },
  { key: "settings" as const, href: "/settings", icon: Settings },
] as const;

function clampWidth(value: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

type SidebarPrefs = { collapsed: boolean; width: number };

const SERVER_PREFS: SidebarPrefs = { collapsed: false, width: DEFAULT_WIDTH };
let cachedPrefs: SidebarPrefs = SERVER_PREFS;

const listeners = new Set<() => void>();

function emitPrefs() {
  for (const listener of listeners) listener();
}

function subscribePrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readPrefsFromStorage(): SidebarPrefs {
  const rawWidth = window.localStorage.getItem(STORAGE_WIDTH);
  const parsed = rawWidth ? Number(rawWidth) : NaN;
  return {
    collapsed: window.localStorage.getItem(STORAGE_COLLAPSED) === "1",
    width: Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH,
  };
}

/** Stable snapshot — useSyncExternalStore compares with Object.is. */
function readPrefs(): SidebarPrefs {
  if (typeof window === "undefined") return cachedPrefs;
  const next = readPrefsFromStorage();
  if (cachedPrefs.collapsed !== next.collapsed || cachedPrefs.width !== next.width) {
    cachedPrefs = next;
  }
  return cachedPrefs;
}

function writePrefs(next: SidebarPrefs) {
  const normalized: SidebarPrefs = {
    collapsed: next.collapsed,
    width: clampWidth(next.width),
  };
  if (cachedPrefs.collapsed === normalized.collapsed && cachedPrefs.width === normalized.width) {
    return;
  }
  window.localStorage.setItem(STORAGE_COLLAPSED, normalized.collapsed ? "1" : "0");
  window.localStorage.setItem(STORAGE_WIDTH, String(normalized.width));
  cachedPrefs = normalized;
  emitPrefs();
}

function useSidebarPrefs() {
  return useSyncExternalStore(subscribePrefs, readPrefs, () => SERVER_PREFS);
}

function navLabel(shell: ShellCopy, key: (typeof navItems)[number]["key"]): string {
  if (key === "cockpit") return shell.nav.cockpit;
  return shell.nav[key];
}

export function Sidebar({
  lang,
  shell,
  role,
}: {
  lang: Locale;
  shell: ShellCopy;
  role: Role;
}) {
  const pathname = usePathname();
  const isManagement = canAccessManagerSettings(role);
  const isAdmin = canAccessAdminSettings(role);
  const showAccueil = canAccessAccueil(role);

  const prefs = useSidebarPrefs();
  const { collapsed, width } = prefs;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [resizeSession, setResizeSession] = useState<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const setCollapsed = useCallback((value: boolean) => {
    writePrefs({ ...readPrefs(), collapsed: value });
  }, []);

  useEffect(() => {
    if (!resizeSession) return;
    const { startX, startWidth } = resizeSession;

    function onMove(e: PointerEvent) {
      setDragWidth(clampWidth(startWidth + (e.clientX - startX)));
    }

    function onUp(e: PointerEvent) {
      const next = clampWidth(startWidth + (e.clientX - startX));
      setDragWidth(null);
      setResizeSession(null);
      writePrefs({ ...readPrefs(), width: next });
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizeSession]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (collapsed) return;
      event.preventDefault();
      setResizeSession({ startX: event.clientX, startWidth: width });
    },
    [collapsed, width],
  );

  const liveWidth = dragWidth ?? width;
  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : liveWidth;

  return (
    <aside
      className={cn(
        "relative hidden lg:flex lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-surface-glass lg:backdrop-blur-xl",
        dragWidth == null && "transition-[width] duration-200 ease-out",
      )}
      style={{ width: effectiveWidth }}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "gap-2.5 px-4",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </div>
        {!collapsed && (
          <p className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-foreground">
            {shell.brand.name}
          </p>
        )}
        {!collapsed && (
          <button
            type="button"
            data-interactive
            onClick={() => setCollapsed(true)}
            className={dna.iconBtn}
            aria-label={shell.common.collapseSidebar}
            title={shell.common.collapseSidebar}
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <nav
        className={cn("flex flex-1 flex-col gap-1 overflow-y-auto p-2", collapsed && "items-stretch")}
        aria-label={shell.common.menu}
      >
        {collapsed && (
          <button
            type="button"
            data-interactive
            onClick={() => setCollapsed(false)}
            className={cn(dna.iconBtn, "mb-1 h-10 w-full")}
            aria-label={shell.common.expandSidebar}
            title={shell.common.expandSidebar}
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          </button>
        )}

        {navItems
          .filter((item) => {
            if ("accueilOnly" in item && item.accueilOnly) return showAccueil;
            if ("managerOnly" in item && item.managerOnly) return isManagement;
            return true;
          })
          .map(({ key, href, icon: Icon }) => {
            const fullHref = `/${lang}${href}`;
            const active =
              key === "cockpit"
                ? pathname?.startsWith(`/${lang}/dashboard`) ||
                  pathname?.startsWith(`/${lang}/cockpit`)
                : pathname?.startsWith(fullHref);
            const label = navLabel(shell, key);

            return (
              <Link
                key={key}
                href={fullHref}
                data-interactive
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "relative flex items-center text-sm font-medium",
                  collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
                  active ? dna.navItemActive : dna.navItemIdle,
                  key === "cockpit" && "font-semibold",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}

        {isAdmin && (
          <div
            className={cn(
              "mt-3 space-y-1 border-t border-border pt-3",
              collapsed && "border-t-0 pt-1",
            )}
          >
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                {shell.nav.franchiseSection}
              </p>
            )}
            <Link
              href={`/${lang}/settings/admin`}
              data-interactive
              aria-current={pathname?.startsWith(`/${lang}/settings/admin`) ? "page" : undefined}
              title={collapsed ? shell.settings.admin : undefined}
              className={cn(
                "flex items-center text-sm font-medium",
                collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
                pathname?.startsWith(`/${lang}/settings/admin`)
                  ? dna.navItemActive
                  : dna.navItemIdle,
              )}
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{shell.settings.admin}</span>}
            </Link>
          </div>
        )}
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-border p-2",
          collapsed && "flex flex-col items-stretch",
        )}
      >
        <Link
          href={`/${lang}/help`}
          title={collapsed ? shell.nav.help : undefined}
          className={cn(
            "flex items-center text-sm font-medium",
            collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
            pathname?.startsWith(`/${lang}/help`) ? dna.navItemActive : dna.navItemIdle,
          )}
        >
          <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{shell.nav.help}</span>}
        </Link>
      </div>

      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={shell.common.resizeSidebar}
          onPointerDown={startResize}
          className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-accent/15 active:bg-accent/25"
        />
      )}
    </aside>
  );
}
