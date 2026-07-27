import { notFound, redirect } from "next/navigation";
import { ConventionPageClient } from "@/components/convention/convention-page-client";
import { DbErrorBanner } from "@/components/db-error-banner";
import { getSessionUser } from "@/lib/auth/session";
import {
  getConventionSignatureStatus,
  getEmployeeDisciplineRecords,
} from "@/lib/data/workplace-convention";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function ConventionPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);

  const { data: status, dbError: statusError } = await safeQuery(
    () => getConventionSignatureStatus(user.id),
    null,
  );

  const { data: records, dbError: recordsError } = await safeQuery(
    () => getEmployeeDisciplineRecords(user.id, lang),
    [],
  );

  const dbError = statusError || recordsError;

  return (
    <div className="flex flex-1 flex-col">
      {dbError && (
        <div className="mx-auto mt-4 w-full max-w-3xl px-4">
          <DbErrorBanner label={dict.convention.dbError} />
        </div>
      )}
      {status && (
        <ConventionPageClient
          lang={lang}
          dict={dict}
          status={status}
          records={records ?? []}
          defaultSignature={user.fullName}
          showDiscipline={user.role === "EMPLOYEE"}
        />
      )}
    </div>
  );
}
