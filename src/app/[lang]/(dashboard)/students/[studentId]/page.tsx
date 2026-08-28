import { notFound, redirect } from "next/navigation";
import { StudentProfile } from "@/components/students/student-profile";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessAccueil, getSessionUser } from "@/lib/auth/session";
import { getCrmStudentProfile } from "@/lib/data/students-crm";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ lang: string; studentId: string }>;
}) {
  const { lang, studentId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessAccueil(user.role)) redirect(`/${lang}/dashboard`);

  const { data, dbError } = await safeQuery(
    () => getCrmStudentProfile(user.id, user.role, studentId),
    null,
  );

  if (!dbError && !data) notFound();

  return (
    <div className="flex flex-1 flex-col">
      {dbError && (
        <div className="px-4 pt-4 sm:px-6">
          <DbErrorBanner label={dict.common.dbDisconnected} />
        </div>
      )}
      {data && <StudentProfile lang={lang} profile={data.profile} dict={dict} />}
    </div>
  );
}
