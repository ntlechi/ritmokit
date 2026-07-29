import { notFound } from "next/navigation";
import { BuddyCard } from "@/components/hr/buddy-card";
import { MobileView } from "@/components/calendar/mobile-view";
import { EmployeeBenefitsCard } from "@/components/benefits/employee-benefits-card";
import { CareerPathCard } from "@/components/benefits/career-path-card";
import { CultureWeekCard } from "@/components/culture/culture-week-card";
import { EmployeeSelfEvalCard } from "@/components/reviews/employee-self-eval-card";
import { SkillProgressCard } from "@/components/skills/skill-progress-card";
import { ShoutOutComposer } from "@/components/shoutouts/shout-out-composer";
import { DbErrorBanner } from "@/components/db-error-banner";
import { getActiveBenefitsForEmployee, getEmployeeCareerPath } from "@/lib/data/benefits";
import { getMobileCultureCardData } from "@/lib/data/culture-mobile";
import { getEmployeeBuddyCard } from "@/lib/data/hr-excellence";
import { getEmployeeOpenReviews } from "@/lib/data/reviews";
import { getEmployeeSkillProgress } from "@/lib/data/skills";
import { getShoutOutComposerContext } from "@/lib/data/shoutouts";
import { getUpcomingShiftsForEmployee } from "@/lib/data/shifts";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PLATFORM_FLAGS } from "@/lib/rsi/experiment-catalog";
import { resolveLocationExperimentFlags } from "@/lib/rsi/platform-experiments";

export const dynamic = "force-dynamic";

export default async function MobilePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);

  if (!user) {
    return (
      <div className="w-full">
        <DbErrorBanner label={dict.common.signInRequired} />
      </div>
    );
  }

  const [
    { data: shifts, dbError },
    { data: buddy },
    { data: skillProgress },
    { data: openReviews },
    { data: benefitsBundle },
    { data: careerPath },
    { data: shoutOutContext },
    { data: cultureCard },
    { data: experimentFlags },
  ] = await Promise.all([
    safeQuery(() => getUpcomingShiftsForEmployee(user.id), []),
    safeQuery(() => getEmployeeBuddyCard(user.id), null),
    safeQuery(() => getEmployeeSkillProgress(user.id), null),
    safeQuery(() => getEmployeeOpenReviews(user.id), []),
    safeQuery(() => getActiveBenefitsForEmployee(user.id), null),
    safeQuery(() => getEmployeeCareerPath(user.id), null),
    safeQuery(() => getShoutOutComposerContext(user.id, lang), null),
    safeQuery(() => getMobileCultureCardData(user.id, lang), null),
    safeQuery(async () => {
      const membership = await prisma.locationMember.findFirst({
        where: { userId: user.id },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { location: { select: { id: true, organizationId: true } } },
      });
      if (!membership) return DEFAULT_PLATFORM_FLAGS;
      return resolveLocationExperimentFlags(
        membership.location.id,
        membership.location.organizationId,
      );
    }, DEFAULT_PLATFORM_FLAGS),
  ]);

  const pendingSelfEval = openReviews?.find((r) => r.status === "PENDING_SELF_EVALUATION");
  const flags = experimentFlags ?? DEFAULT_PLATFORM_FLAGS;

  const cultureBlock = cultureCard ? (
    <CultureWeekCard data={cultureCard} dict={dict} />
  ) : null;
  const buddyBlock = buddy ? <BuddyCard buddy={buddy} dict={dict} lang={lang} /> : null;

  return (
    <div className="flex w-full flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-5 xl:gap-6">
      {dbError && (
        <div className="lg:col-span-12">
          <DbErrorBanner label={dict.common.dbDisconnected} />
        </div>
      )}

      <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
        <MobileView shifts={shifts} locale={lang} dict={dict} />
      </div>

      <div className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
        {flags.cultureCardAboveBuddy ? (
          <>
            {cultureBlock}
            {pendingSelfEval && (
              <EmployeeSelfEvalCard
                review={pendingSelfEval}
                dict={dict}
                lang={lang}
                defaultSignature={user.fullName}
              />
            )}
            {buddyBlock}
          </>
        ) : (
          <>
            {pendingSelfEval && (
              <EmployeeSelfEvalCard
                review={pendingSelfEval}
                dict={dict}
                lang={lang}
                defaultSignature={user.fullName}
              />
            )}
            {buddyBlock}
            {cultureBlock}
          </>
        )}
        {shoutOutContext && (
          <ShoutOutComposer context={shoutOutContext} dict={dict} lang={lang} />
        )}
        {careerPath && <CareerPathCard path={careerPath} dict={dict} lang={lang} />}
        {skillProgress && !careerPath && (
          <SkillProgressCard progress={skillProgress} dict={dict} lang={lang} />
        )}
        {benefitsBundle && benefitsBundle.benefits.length > 0 && (
          <EmployeeBenefitsCard benefits={benefitsBundle.benefits} dict={dict} />
        )}
      </div>
    </div>
  );
}
