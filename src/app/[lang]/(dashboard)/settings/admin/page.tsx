import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { canAccessAdminSettings, canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getAdminTenantMatrix } from "@/lib/data/admin";
import { safeQuery } from "@/lib/data/safe";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user || !canAccessAdminSettings(user.role)) {
    redirect(`/${lang}/settings`);
  }

  const { data: tenants, dbError } = await safeQuery(() => getAdminTenantMatrix(), []);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="gradient-text text-xl font-bold tracking-tight">
              {dict.settings.adminConsoleTitle}
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.settings.adminConsoleSubtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
        <nav className="flex shrink-0 gap-2 overflow-x-auto lg:w-48 lg:flex-col lg:gap-1">
          <Link
            href={`/${lang}/settings`}
            className="rounded-xl px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted"
          >
            {dict.settings.general}
          </Link>
          {canAccessManagerSettings(user.role) && (
            <Link
              href={`/${lang}/settings/manager`}
              className="rounded-xl px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted"
            >
              {dict.settings.manager}
            </Link>
          )}
          <Link
            href={`/${lang}/settings/admin`}
            className="rounded-xl bg-accent-muted px-3 py-2 text-sm font-medium text-accent"
          >
            {dict.settings.admin}
          </Link>
        </nav>

        <div className="min-w-0 flex-1 space-y-4">
          {dbError && (
            <p className="text-sm text-danger">{dict.culture.errors.databaseError}</p>
          )}

          {!tenants || tenants.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface-muted px-4 py-8 text-center text-sm text-foreground-muted">
              {dict.settings.adminEmpty}
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
                      <th className="px-4 py-3">{dict.settings.adminOrg}</th>
                      <th className="px-4 py-3">{dict.settings.adminLocation}</th>
                      <th className="px-4 py-3">{dict.settings.adminLicense}</th>
                      <th className="px-4 py-3">{dict.settings.adminRegion}</th>
                      <th className="px-4 py-3 text-right">{dict.team.members}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {tenants.map((row) => (
                      <tr
                        key={row.locationId}
                        className="transition-colors hover:bg-surface-muted/60"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{row.organizationName}</p>
                          <p className="font-mono text-[11px] text-foreground-muted">
                            {row.organizationSlug}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.locationName}</p>
                          {row.city && (
                            <p className="text-xs text-foreground-muted">{row.city}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                              row.isActive
                                ? "border-success/25 bg-success/10 text-success"
                                : "border-border bg-surface-muted text-foreground-muted",
                            )}
                          >
                            {row.isActive
                              ? dict.settings.adminLicenseActive
                              : dict.settings.adminLicenseInactive}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground-muted">
                          {row.timezone}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground-muted">
                          {row.memberCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
