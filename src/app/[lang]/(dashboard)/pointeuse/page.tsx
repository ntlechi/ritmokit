import { notFound } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { OnboardingComplianceBanner } from "@/components/onboarding/onboarding-compliance-banner";
import { PendingFeedbackQueue } from "@/components/feedback/flash-feedback-card";
import { TipVoteCard } from "@/components/punch/tip-vote-card";
import { PunchScreen } from "@/components/punch/punch-screen";
import { PulseSurveyCard } from "@/components/pulse/pulse-survey-card";
import { TrainingComplianceBanner } from "@/components/training/training-compliance-banner";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getPendingFeedbackForManager } from "@/lib/data/feedback";
import { getEmployeeOnboardingState } from "@/lib/data/hr-onboarding";
import { getPunchStatusForUser, type PunchStatus } from "@/lib/data/punch";
import { getPulsePromptForUser } from "@/lib/data/pulse";
import { getEmployeeVoteBallot } from "@/lib/data/tips";
import { getTrainingComplianceForUser } from "@/lib/data/training";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

const EMPTY_STATUS: PunchStatus = {
  state: "no_shift",
  shift: null,
  actualStartsAt: null,
  actualEndsAt: null,
  breakStartedAt: null,
  breakEndedAt: null,
  breakTakenMinutes: null,
  location: null,
};

export default async function PunchPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-8">
        <DbErrorBanner label={dict.common.signInRequired} />
      </div>
    );
  }

  const isManager = canAccessManagerSettings(user.role);

  const [
    { data: status, dbError },
    { data: voteBallot },
    { data: onboardingState },
    { data: pendingFeedback },
  ] = await Promise.all([
    safeQuery(() => getPunchStatusForUser(user.id), EMPTY_STATUS),
    safeQuery(() => getEmployeeVoteBallot(user.id, lang), null),
    safeQuery(
      () => (user.role === "EMPLOYEE" ? getEmployeeOnboardingState(user.id) : Promise.resolve(null)),
      null,
    ),
    safeQuery(
      () => (isManager ? getPendingFeedbackForManager(user.id, user.role) : Promise.resolve([])),
      [],
    ),
  ]);

  const [{ data: trainingCompliance }, { data: pulsePrompt }] = await Promise.all([
    safeQuery(
      () =>
        getTrainingComplianceForUser(
          user.id,
          status.shift?.locationId,
          status.shift?.stationId,
        ),
      null,
    ),
    safeQuery(
      () =>
        status.state === "clocked_out" ? getPulsePromptForUser(user.id, lang) : Promise.resolve(null),
      null,
    ),
  ]);

  const showOnboardingBlock =
    user.role === "EMPLOYEE" &&
    onboardingState &&
    !(onboardingState.step1Complete && onboardingState.step2Complete && onboardingState.step3Complete);

  const showTrainingBlock =
    user.role === "EMPLOYEE" && !showOnboardingBlock && trainingCompliance && !trainingCompliance.isCompliant;

  return (
    <div className="flex flex-1 flex-col">
      {dbError && (
        <div className="mx-auto mt-4 w-full max-w-md">
          <DbErrorBanner label={dict.common.dbDisconnected} />
        </div>
      )}
      {showOnboardingBlock && (
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <OnboardingComplianceBanner lang={lang} dict={dict} />
        </div>
      )}
      {showTrainingBlock && (
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <TrainingComplianceBanner lang={lang} dict={dict} compliance={trainingCompliance} />
        </div>
      )}
      {voteBallot && (
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <TipVoteCard ballot={voteBallot} dict={dict} defaultSignature={user.fullName} />
        </div>
      )}
      {isManager && pendingFeedback && pendingFeedback.length > 0 && (
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <PendingFeedbackQueue items={pendingFeedback} dict={dict} lang={lang} />
        </div>
      )}
      {pulsePrompt && (
        <div className="mx-auto w-full max-w-md px-4 pt-4">
          <PulseSurveyCard prompt={pulsePrompt} dict={dict} />
        </div>
      )}
      <PunchScreen
        lang={lang}
        dict={dict}
        initialStatus={status}
        trainingBlocked={showTrainingBlock ?? false}
        onboardingBlocked={showOnboardingBlock ?? false}
      />
    </div>
  );
}
