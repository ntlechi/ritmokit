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
  BookOpen,
  Settings,
  Sparkles,
  MessagesSquare,
  Timer,
  LifeBuoy,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { ShellCopy } from "@/lib/i18n/shell-copy";
import type { Role } from "@/generated/prisma/enums";
import { canAccessAdminSettings, canAccessManagerSettings } from "@/lib/auth/session-client";
import { cn } from "@/lib/utils";

const STORAGE_COLLAPSED = "mirok-sidebar-collapsed";
const STORAGE_WIDTH = "mirok-sidebar-width";

const COLLAPSED_WIDTH = 72;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;

const navItems = [
  { key: "calendar" as const, href: "/calendar/week", icon: Calendar },
  { key: "punch" as const, href: "/pointeuse", icon: Timer },
  { key: "messages" as const, href: "/messages", icon: MessagesSquare },
  { key: "sops" as const, href: "/sops", icon: BookOpen },
  { key: "team" as const, href: "/team", icon: Users },
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
  const cockpitHref = `/${lang}/dashboard`;
  const cockpitActive =
    pathname?.startsWith(cockpitHref) || pathname?.startsWith(`/${lang}/settings/manager`);

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
        "relative hidden lg:flex lg:shrink-0 lg:flex-col lg:border-r lg:border-zinc-200/80 lg:bg-white/80 lg:backdrop-blur-xl dark:lg:border-white/10 dark:lg:bg-zinc-900/80",
        dragWidth == null && "transition-[width] duration-200 ease-out",
      )}
      style={{ width: effectiveWidth }}
      data-collapsed={collapsed ? "true" : "false"}
    >
      {/* Brand — same height as AppHeader for a continuous hairline */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-zinc-200/80 dark:border-white/10",
          collapsed ? "justify-center px-2" : "gap-2.5 px-4",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
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
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5"
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
            className="mb-1 flex h-10 w-full items-center justify-center rounded-xl text-foreground-muted transition-colors hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5"
            aria-label={shell.common.expandSidebar}
            title={shell.common.expandSidebar}
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden />
          </button>
        )}

        {navItems.map(({ key, href, icon: Icon }) => {
          const fullHref = `/${lang}${href}`;
          const active = pathname?.startsWith(fullHref);
          const label = shell.nav[key];

          return (
            <Link
              key={key}
              href={fullHref}
              data-interactive
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "relative flex items-center rounded-xl text-sm font-medium",
                collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
                  : "text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}

        {isManagement && (
          <div
            className={cn(
              "mt-3 space-y-1 border-t border-zinc-200/80 pt-3 dark:border-white/10",
              collapsed && "border-t-0 pt-1",
            )}
          >
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
                {shell.nav.franchiseSection}
              </p>
            )}
            <Link
              href={cockpitHref}
              data-interactive
              aria-current={cockpitActive ? "page" : undefined}
              title={collapsed ? shell.nav.cockpit : undefined}
              className={cn(
                "relative flex items-center rounded-xl text-sm font-semibold",
                collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
                cockpitActive
                  ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
                  : "text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5",
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{shell.nav.cockpit}</span>}
            </Link>
            {isAdmin && (
              <Link
                href={`/${lang}/settings/admin`}
                data-interactive
                aria-current={pathname?.startsWith(`/${lang}/settings/admin`) ? "page" : undefined}
                title={collapsed ? shell.settings.admin : undefined}
                className={cn(
                  "flex items-center rounded-xl text-sm font-medium",
                  collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
                  pathname?.startsWith(`/${lang}/settings/admin`)
                    ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
                    : "text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5",
                )}
              >
                <Settings className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{shell.settings.admin}</span>}
              </Link>
            )}
          </div>
        )}
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-zinc-200/80 p-2 dark:border-white/10",
          collapsed && "flex flex-col items-stretch",
        )}
      >
        <Link
          href={`/${lang}/help`}
          title={collapsed ? shell.nav.help : undefined}
          className={cn(
            "flex items-center rounded-xl text-sm font-medium",
            collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2.5",
            pathname?.startsWith(`/${lang}/help`)
              ? "bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900"
              : "text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5",
          )}
        >
          <LifeBuoy className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{shell.nav.help}</span>}
        </Link>
      </div>

      {/* Resize handle — expanded only */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={shell.common.resizeSidebar}
          onPointerDown={startResize}
          className="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize touch-none hover:bg-zinc-900/10 active:bg-zinc-900/15 dark:hover:bg-white/10 dark:active:bg-white/15"
        />
      )}
    </aside>
  );
}
