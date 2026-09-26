import { notFound, redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { DbErrorBanner } from "@/components/db-error-banner";
import { IntakeInbox } from "@/components/students/intake-inbox";
import { dna } from "@/lib/design/dna";
import { canAccessAccueil, getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { INTAKE_BOARD_ORDER, type IntakeStatusValue } from "@/lib/dance/intake-rules";
import { countIntakeByStatus, listIntakeStaff, listIntakes } from "@/lib/data/intake";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

function parseStatus(raw: string | string[] | undefined): IntakeStatusValue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (INTAKE_BOARD_ORDER as readonly string[]).includes(value ?? "")
    ? (value as IntakeStatusValue)
    : "NEW";
}

export default async function NewStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ lang }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessAccueil(user.role)) redirect(`/${lang}`);

  const status = parseStatus(query.status);
  const copy = dict.studioOps.intake;

  const { data, dbError } = await safeQuery(async () => {
    const membership = await getPrimaryMembership(user.id);
    if (!membership) return null;
    const [counts, page, staff] = await Promise.all([
      countIntakeByStatus(membership.locationId),
      listIntakes(membership.locationId, [status]),
      listIntakeStaff(membership.locationId),
    ]);
    return { counts, page, staff, locationName: membership.location.name };
  }, null);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <UserPlus className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {copy.badge}
              {data?.locationName ? ` · ${data.locationName}` : ""}
            </p>
            <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
              {copy.title}
            </h1>
            <p className={dna.subtitle}>{copy.subtitle}</p>
          </div>
        </div>
      </header>

      {dbError && (
        <div className="px-4 pt-4 sm:px-6">
          <DbErrorBanner label={dict.common.dbDisconnected} />
        </div>
      )}
      {data && (
        <IntakeInbox
          key={status}
          lang={lang}
          status={status}
          counts={data.counts}
          initialPage={data.page}
          staff={data.staff}
          copy={copy}
          levels={dict.dance.levels}
        />
      )}
    </div>
  );
}
