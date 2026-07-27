import { notFound } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { LessonPlayer } from "@/components/training/LessonPlayer";
import { getSessionUser } from "@/lib/auth/session";
import { getFormationCatalogForUser, getFormationModuleForUser } from "@/lib/data/training";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

const emptyCatalog = {
  primaryStationId: null,
  stations: [],
  categories: [],
  sections: [],
  totalLessons: 0,
  completedLessons: 0,
  seniorityDays: 0,
  resumeModule: null,
};

export default async function TrainingModulePage({
  params,
}: {
  params: Promise<{ lang: string; moduleId: string }>;
}) {
  const { lang, moduleId } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const user = await getSessionUser();

  if (!user) notFound();

  const [{ data: module, dbError }, { data: catalog }] = await Promise.all([
    safeQuery(() => getFormationModuleForUser(user.id, moduleId), null),
    safeQuery(() => getFormationCatalogForUser(user.id), emptyCatalog),
  ]);

  if (dbError) {
    return (
      <div className="mx-auto max-w-md py-8">
        <DbErrorBanner label={dict.training.dbError} />
      </div>
    );
  }

  if (!module) notFound();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50/50 dark:bg-transparent">
      <LessonPlayer
        lang={lang}
        dict={dict}
        module={module}
        catalog={catalog}
        defaultSignature={user.fullName}
      />
    </div>
  );
}
