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
  Banknote,
  ClipboardCheck,
  BookOpen,
  ContactRound,
  CalendarRange,
  GraduationCap,
  UserPlus,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { ShellCopy } from "@/lib/i18n/shell-copy";
import type { Role } from "@/generated/prisma/enums";
import {
  canAccessAccueil,
  canAccessAdminSettings,
  canAccessManagerSettings,
  canAccessTeaching,
} from "@/lib/auth/session-client";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";
import type { LocationScope } from "@/components/layout/location-scope";
import { LocationSwitcher } from "@/components/layout/location-switcher";

const STORAGE_COLLAPSED = "ritmokit-sidebar-collapsed";
const STORAGE_WIDTH = "ritmokit-sidebar-width";

const COLLAPSED_WIDTH = 72;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;

type NavGate = "manager" | "accueil" | "teaching";

type NavItem = {
  key: NavKey;
  href: string;
  icon: typeof Calendar;
  gate?: NavGate;
  badge?: keyof NavBadges;
};

export type NavKey =
  | "cockpit"
  | "teach"
  | "accueil"
  | "planning"
  | "sessions"
  | "plans"
  | "studentsNew"
  | "students"
  | "interac"
  | "rooms"
  | "rentals"
  | "calendar"
  | "team"
  | "messages"
  | "settings";

export type NavBadges = { studentsNew: number; interac: number };

/** Grouped by the question staff ask: what's tonight, which classes, which students, the studio. */
const navSections: {
  key: "sectionToday" | "sectionCourses" | "sectionStudents" | "sectionStudio";
  items: NavItem[];
}[] = [
  {
    key: "sectionToday",
    items: [
      { key: "cockpit", href: "/dashboard", icon: LayoutDashboard, gate: "manager" },
      { key: "teach", href: "/teach", icon: GraduationCap, gate: "teaching" },
      { key: "accueil", href: "/accueil", icon: ClipboardCheck, gate: "accueil" },
    ],
  },
  {
    key: "sectionCourses",
    items: [
      { key: "planning", href: "/planning", icon: CalendarRange, gate: "manager" },
      { key: "sessions", href: "/sessions", icon: Music2, gate: "manager" },
      { key: "plans", href: "/plans", icon: BookOpen, gate: "teaching" },
    ],
  },
  {
    key: "sectionStudents",
    items: [
      { key: "studentsNew", href: "/students/new", icon: UserPlus, gate: "accueil", badge: "studentsNew" },
      { key: "students", href: "/students", icon: ContactRound, gate: "accueil" },
      { key: "interac", href: "/interac", icon: Banknote, gate: "manager", badge: "interac" },
    ],
  },
  {
    key: "sectionStudio",
    items: [
      { key: "rooms", href: "/rooms", icon: DoorOpen, gate: "manager" },
      { key: "rentals", href: "/rentals", icon: KeyRound, gate: "manager" },
      { key: "calendar", href: "/calendar/week", icon: Calendar },
      { key: "team", href: "/team", icon: Users },
      { key: "messages", href: "/messages", icon: MessagesSquare },
      { key: "settings", href: "/settings", icon: Settings },
    ],
  },
];

/** `/students` must not light up while on `/students/new`. */
export function isNavActive(pathname: string | null, lang: string, key: NavKey, href: string) {
  if (!pathname) return false;
  if (key === "cockpit") {
    return pathname.startsWith(`/${lang}/dashboard`) || pathname.startsWith(`/${lang}/cockpit`);
  }
  const full = `/${lang}${href}`;
  if (key === "students") {
    return pathname.startsWith(full) && !pathname.startsWith(`/${lang}/students/new`);
  }
  return pathname === full || pathname.startsWith(`${full}/`);
}

export function formatBadge(n: number): string {
  return n > 99 ? "99+" : String(n);
}

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
  locationScope,
  badges,
}: {
  lang: Locale;
  shell: ShellCopy;
  role: Role;
  locationScope?: LocationScope | null;
  badges?: NavBadges | null;
}) {
  const pathname = usePathname();
  const isManagement = canAccessManagerSettings(role);
  const isAdmin = canAccessAdminSettings(role);
  const gates: Record<NavGate, boolean> = {
    manager: isManagement,
    accueil: canAccessAccueil(role),
    teaching: canAccessTeaching(role),
  };
  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.gate || gates[item.gate]),
    }))
    .filter((section) => section.items.length > 0);

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
          "flex shrink-0 items-center border-b border-border",
          collapsed ? "h-14 justify-center px-2" : "min-h-14 gap-2.5 px-4 py-2",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-foreground">
              {shell.brand.name}
            </p>
            {locationScope ? (
              <LocationSwitcher
                scope={locationScope}
                label={shell.common.switchSchool}
                dense
              />
            ) : null}
          </div>
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
        {collapsed && locationScope && locationScope.locations.length > 1 && (
          <div className="mb-1 flex justify-center">
            <LocationSwitcher
              scope={locationScope}
              label={shell.common.switchSchool}
              collapsed
            />
          </div>
        )}

        {sections.map((section, sectionIdx) => (
          <div
            key={section.key}
            className={cn(
              "space-y-0.5",
              sectionIdx > 0 && (collapsed ? "mt-1 border-t border-border pt-1" : "mt-3"),
            )}
          >
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
                {shell.nav[section.key]}
              </p>
            )}
            {section.items.map(({ key, href, icon: Icon, badge }) => {
              const active = isNavActive(pathname, lang, key, href);
              const label = shell.nav[key];
              const count = badge ? (badges?.[badge] ?? 0) : 0;

              return (
                <Link
                  key={key}
                  href={`/${lang}${href}`}
                  data-interactive
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? (count > 0 ? `${label} (${count})` : label) : undefined}
                  className={cn(
                    "relative flex items-center text-sm font-medium",
                    collapsed ? "h-10 justify-center px-0" : "gap-3 px-3 py-2",
                    active ? dna.navItemActive : dna.navItemIdle,
                    (key === "cockpit" || key === "teach") && "font-semibold",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                  {count > 0 &&
                    (collapsed ? (
                      <span
                        className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-danger"
                        aria-hidden
                      />
                    ) : (
                      <span
                        className={cn(
                          "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums",
                          active ? "bg-accent-foreground/20 text-accent-foreground" : "bg-danger text-white",
                        )}
                      >
                        {formatBadge(count)}
                      </span>
                    ))}
                </Link>
              );
            })}
          </div>
        ))}

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
