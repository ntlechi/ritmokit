import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProfileDossierView } from "@/components/profile/profile-dossier-view";
import { DbErrorBanner } from "@/components/db-error-banner";
import { getSessionUser } from "@/lib/auth/session";
import { getWeeklyAvailabilityForUser } from "@/lib/data/availability";
import { getEmployeeCareerPath } from "@/lib/data/benefits";
import { getProfileDossierCore } from "@/lib/data/profile-dossier";
import { safeQuery } from "@/lib/data/safe";
import { getShoutOutComposerContext } from "@/lib/data/shoutouts";
import { getEmployeeSkillProgress } from "@/lib/data/skills";
import { getTimeOffHistoryForUser } from "@/lib/data/timeoff";
import { getFormationCatalogForUser } from "@/lib/data/training";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);

  const [core, training, skills, career, recognition, availability, timeOff] =
    await Promise.all([
      safeQuery(() => getProfileDossierCore(user.id), null),
      safeQuery(() => getFormationCatalogForUser(user.id), null),
      safeQuery(() => getEmployeeSkillProgress(user.id), null),
      safeQuery(() => getEmployeeCareerPath(user.id), null),
      safeQuery(() => getShoutOutComposerContext(user.id, lang), null),
      safeQuery(() => getWeeklyAvailabilityForUser(user.id), null),
      safeQuery(() => getTimeOffHistoryForUser(user.id), []),
    ]);

  if (!core.data) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <DbErrorBanner label={dict.profile.errors.databaseError} />
        <Link href={`/${lang}/settings`} className="text-sm text-accent hover:underline">
          ← {dict.settings.general}
        </Link>
      </div>
    );
  }

  return (
    <ProfileDossierView
      lang={lang}
      dict={dict}
      data={{
        core: core.data,
        training: training.data,
        skills: skills.data,
        career: career.data,
        recognition: recognition.data,
        availability: availability.data,
        timeOff: timeOff.data ?? [],
      }}
    />
  );
}
