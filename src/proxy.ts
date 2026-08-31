import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales, type Locale } from "@/lib/i18n/config";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

function getPreferredLocale(request: NextRequest): string {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    negotiatorHeaders[key] = value;
  });

  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();

  try {
    return match(languages, locales, defaultLocale);
  } catch {
    return defaultLocale;
  }
}

/**
 * Routes accessibles sans session : l'écran de connexion et le callback
 * d'invitation / lien magique (hash, token_hash, ou PKCE `code` —
 * voir app/[lang]/auth/callback/page.tsx).
 */
const PUBLIC_PREFIXES = ["/login", "/auth/callback"];

function isPublicRoute(pathWithoutLocale: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathWithoutLocale === prefix || pathWithoutLocale.startsWith(`${prefix}/`),
  );
}

const MANAGER_ROLES = new Set(["MANAGER", "OWNER", "ADMIN"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---------------------------------------------------------------------
  // 1. Préfixage i18n (comportement inchangé) — doit s'exécuter avant tout
  //    le reste : une requête sans locale est toujours redirigée d'abord.
  // ---------------------------------------------------------------------
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (!pathnameHasLocale) {
    const locale = getPreferredLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname}`;
    return NextResponse.redirect(url);
  }

  // ---------------------------------------------------------------------
  // 2. Rafraîchissement de session Supabase + gating d'authentification.
  // ---------------------------------------------------------------------
  const segments = pathname.split("/").filter(Boolean);
  const lang = (segments[0] ?? defaultLocale) as Locale;
  const pathWithoutLocale = "/" + segments.slice(1).join("/");
  const isAuthRoute = isPublicRoute(pathWithoutLocale);

  let user: User | null = null;
  let getResponse = () => NextResponse.next({ request: { headers: request.headers } });

  try {
    const client = createMiddlewareClient(request);
    getResponse = client.getResponse;
    const { data, error } = await client.supabase.auth.getUser();
    if (error) {
      console.error("[proxy] supabase.auth.getUser:", error.message);
    }
    user = data.user;
  } catch (err) {
    console.error("[proxy] supabase client unavailable:", err);
  }

  // En développement, `getSessionUser()` (lib/auth/session.ts) retombe sur
  // un utilisateur seed tant qu'aucune vraie session n'existe, pour ne pas
  // bloquer le travail sur le reste de l'app avant que l'écran /login
  // (prochaine étape) ne soit livré. On reproduit la même tolérance ici via
  // AUTH_ENFORCE_DEV=1 pour tester le parcours de redirection en local
  // sans attendre le déploiement.
  const authEnforced = process.env.NODE_ENV === "production" || process.env.AUTH_ENFORCE_DEV === "1";

  if (!user && !isAuthRoute && authEnforced) {
    const url = request.nextUrl.clone();
    url.pathname = `/${lang}/login`;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = `/${lang}`;
    return NextResponse.redirect(url);
  }

  // Role-gating rapide côté edge, à partir de `app_metadata.role` (tenu à
  // jour par le trigger `sync_user_role_to_auth_metadata`, voir
  // supabase/migrations/0004_auth_profile_sync.sql). Ce n'est qu'un filtre
  // de confort : la source de vérité reste `public.users.role`, revalidée
  // par `getSessionUser()` / `canAccessAdminSettings()` côté page.
  if (user) {
    const role = (user.app_metadata as { role?: string } | undefined)?.role;

    if (pathWithoutLocale.startsWith("/settings/admin") && role && role !== "ADMIN") {
      const url = request.nextUrl.clone();
      url.pathname = `/${lang}/settings`;
      return NextResponse.redirect(url);
    }

    // Only redirect when JWT role is present and clearly non-manager.
    // Missing app_metadata.role must not block Prisma-backed managers.
    if (
      pathWithoutLocale.startsWith("/settings/manager") &&
      role &&
      !MANAGER_ROLES.has(role)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/${lang}/settings`;
      return NextResponse.redirect(url);
    }
  }

  return getResponse();
}

export const config = {
  matcher: [
    "/((?!_next|api|serwist|~offline|manifest.webmanifest|icon|apple-icon|favicon.ico).*)",
  ],
};
