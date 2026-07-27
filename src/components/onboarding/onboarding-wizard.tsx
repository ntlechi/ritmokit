"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Check,
  ChevronRight,
  FileSignature,
  GraduationCap,
  Lock,
  Phone,
  Shield,
} from "lucide-react";
import {
  saveEmergencyContactAction,
} from "@/lib/actions/hr-onboarding";
import { savePunchPinAction } from "@/lib/actions/punch-pin";
import { signWorkplaceConventionAction } from "@/lib/actions/workplace-convention";
import type { EmployeeOnboardingState } from "@/lib/data/hr-onboarding";
import { ConventionDocument } from "@/components/convention/convention-document";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StepId = 1 | 2 | 3;

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.onboarding.errors.unauthorized,
    invalid_contact: dict.onboarding.errors.invalidContact,
    invalid_sin: dict.onboarding.errors.invalidSin,
    invalid_bank: dict.onboarding.errors.invalidBank,
    invalid_signature: dict.onboarding.errors.invalidSignature,
    step1_required: dict.onboarding.errors.step1Required,
    already_signed: dict.convention.errors.alreadySigned,
    database_error: dict.onboarding.errors.databaseError,
    invalid_pin: dict.onboarding.errors.invalidPin,
    weak_pin: dict.onboarding.errors.weakPin,
    pin_taken: dict.onboarding.errors.pinTaken,
    no_location: dict.onboarding.errors.noLocation,
  };
  return map[code] ?? dict.onboarding.errors.databaseError;
}

function StepPill({
  step,
  label,
  complete,
  active,
  onClick,
}: {
  step: number;
  label: string;
  complete: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors",
        active ? "border-accent bg-accent-muted" : "border-border bg-surface",
        complete && !active && "border-success/30",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
          complete ? "bg-success text-white" : active ? "bg-accent text-white" : "bg-surface-muted text-foreground-muted",
        )}
      >
        {complete ? <Check className="h-4 w-4" aria-hidden /> : step}
      </span>
      <span className="text-[10px] font-medium leading-tight text-foreground-muted">{label}</span>
    </button>
  );
}

export function OnboardingWizard({
  lang,
  dict,
  state,
  defaultSignature = "",
}: {
  lang: Locale;
  dict: Dictionary;
  state: EmployeeOnboardingState;
  defaultSignature?: string;
}) {
  const router = useRouter();
  const initialStep: StepId = !state.step1Complete ? 1 : !state.step2Complete ? 2 : 3;
  const [activeStep, setActiveStep] = useState<StepId>(initialStep);
  const [contactName, setContactName] = useState(state.emergencyContactName ?? "");
  const [contactPhone, setContactPhone] = useState(state.emergencyContactPhone ?? "");
  const [sinLastFour, setSinLastFour] = useState(state.sinLastFour ?? "");
  const [bankInstitution, setBankInstitution] = useState("");
  const [bankTransit, setBankTransit] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [signature, setSignature] = useState(defaultSignature);
  const [punchPin, setPunchPin] = useState("");
  const [handbookOpen, setHandbookOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allComplete = state.step1Complete && state.step2Complete && state.step3Complete;

  const step3Progress = useMemo(() => {
    const available = state.onboardingModules.filter((m) => m.unlocked);
    const total = available.length;
    const done = available.filter((m) => m.completed).length;
    return { done, total };
  }, [state.onboardingModules]);

  function saveStep1() {
    setError(null);
    startTransition(async () => {
      const result = await saveEmergencyContactAction({
        name: contactName,
        phone: contactPhone,
        sinLastFour: sinLastFour || undefined,
        bankInstitutionNumber: bankInstitution || undefined,
        bankTransitNumber: bankTransit || undefined,
        bankAccountNumber: bankAccount || undefined,
      });
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      if (!state.hasPunchPin) {
        if (!/^\d{4}$/.test(punchPin.trim())) {
          setError(resolveError(dict, "invalid_pin"));
          return;
        }
        const pinResult = await savePunchPinAction(punchPin.trim());
        if (!pinResult.ok) {
          setError(resolveError(dict, pinResult.error));
          return;
        }
      }
      setActiveStep(2);
      router.refresh();
    });
  }

  function signConvention() {
    setError(null);
    startTransition(async () => {
      const result = await signWorkplaceConventionAction(signature);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setActiveStep(3);
      router.refresh();
    });
  }

  if (allComplete) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <Check className="h-8 w-8 text-success" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{dict.onboarding.completedTitle}</h1>
        <p className="mt-2 text-center text-sm text-foreground-muted">{dict.onboarding.completedSubtitle}</p>
        <Link
          href={`/${lang}/calendar/mobile`}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          {dict.onboarding.goToShifts}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <header className="mb-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{dict.onboarding.title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{dict.onboarding.subtitle}</p>
      </header>

      <div className="mb-6 flex gap-2">
        <StepPill
          step={1}
          label={dict.onboarding.step1Short}
          complete={state.step1Complete}
          active={activeStep === 1}
          onClick={() => setActiveStep(1)}
        />
        <StepPill
          step={2}
          label={dict.onboarding.step2Short}
          complete={state.step2Complete}
          active={activeStep === 2}
          onClick={() => state.step1Complete && setActiveStep(2)}
        />
        <StepPill
          step={3}
          label={dict.onboarding.step3Short}
          complete={state.step3Complete}
          active={activeStep === 3}
          onClick={() => state.step2Complete && setActiveStep(3)}
        />
      </div>

      {activeStep === 1 && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{dict.onboarding.step1Title}</h2>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">{dict.onboarding.step1Subtitle}</p>

          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{dict.onboarding.emergencyName}</span>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{dict.onboarding.emergencyPhone}</span>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{dict.onboarding.sinOptional}</span>
              <input
                value={sinLastFour}
                onChange={(e) => setSinLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                maxLength={4}
                className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
              />
              <span className="text-[11px] text-foreground-muted">{dict.onboarding.sinHint}</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{dict.onboarding.punchPinLabel}</span>
              {state.hasPunchPin ? (
                <p className="rounded-xl border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-success">
                  {dict.onboarding.punchPinSet}
                </p>
              ) : (
                <>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={punchPin}
                    onChange={(e) => setPunchPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    maxLength={4}
                    className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
                  />
                  <span className="text-[11px] text-foreground-muted">{dict.onboarding.punchPinHint}</span>
                </>
              )}
            </label>
            <div className="rounded-xl border border-border bg-surface-muted p-3">
              <p className="text-xs font-medium text-foreground-muted">{dict.onboarding.bankOptional}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <input
                  value={bankInstitution}
                  onChange={(e) => setBankInstitution(e.target.value)}
                  placeholder={dict.onboarding.bankInstitution}
                  className="rounded-lg border border-border bg-surface px-2 py-2 text-xs"
                />
                <input
                  value={bankTransit}
                  onChange={(e) => setBankTransit(e.target.value)}
                  placeholder={dict.onboarding.bankTransit}
                  className="rounded-lg border border-border bg-surface px-2 py-2 text-xs"
                />
                <input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder={dict.onboarding.bankAccount}
                  className="rounded-lg border border-border bg-surface px-2 py-2 text-xs"
                />
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <Button className="mt-4 w-full" disabled={isPending} onClick={saveStep1}>
            {isPending ? dict.onboarding.saving : dict.onboarding.continue}
          </Button>
        </section>
      )}

      {activeStep === 2 && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{dict.onboarding.step2Title}</h2>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">{dict.onboarding.step2Subtitle}</p>

          <button
            type="button"
            onClick={() => setHandbookOpen((v) => !v)}
            className="mt-3 flex w-full items-center gap-2 text-left text-xs font-medium text-accent hover:underline"
          >
            <Shield className="h-3.5 w-3.5" aria-hidden />
            {dict.onboarding.readHandbook}
          </button>

          {handbookOpen && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-muted px-3 py-2">
              <ConventionDocument lang={lang} dict={dict} compact />
            </div>
          )}

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground-muted">{dict.onboarding.signatureLabel}</span>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
            />
          </label>
          <p className="mt-2 text-[11px] text-foreground-muted">{dict.onboarding.signatureDisclaimer}</p>

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <Button
            className="mt-4 w-full"
            disabled={isPending || signature.trim().length < 2}
            onClick={signConvention}
          >
            {isPending ? dict.onboarding.signing : dict.onboarding.signAndContinue}
          </Button>
        </section>
      )}

      {activeStep === 3 && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{dict.onboarding.step3Title}</h2>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">{dict.onboarding.step3Subtitle}</p>

          {state.onboardingModules.length === 0 ? (
            <p className="mt-4 text-sm text-foreground-muted">{dict.onboarding.noModules}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {state.onboardingModules.map((module) => {
                const locked = !module.unlocked;
                const content = (
                  <>
                    <div className="flex items-center gap-3">
                      {module.completed ? (
                        <Check className="h-4 w-4 text-success" aria-hidden />
                      ) : locked ? (
                        <Lock className="h-4 w-4 text-foreground-muted" aria-hidden />
                      ) : (
                        <BookOpen className="h-4 w-4 text-accent" aria-hidden />
                      )}
                      <div>
                        <span className="text-sm font-medium">{module.title}</span>
                        {locked && module.lockedLabel && (
                          <p className="text-[11px] text-foreground-muted">{module.lockedLabel}</p>
                        )}
                      </div>
                    </div>
                    {!locked && <ChevronRight className="h-4 w-4 text-foreground-muted" aria-hidden />}
                  </>
                );

                if (locked) {
                  return (
                    <li
                      key={module.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/50 px-4 py-3 opacity-70"
                    >
                      {content}
                    </li>
                  );
                }

                return (
                  <li key={module.id}>
                    <Link
                      href={`/${lang}/sops/${module.id}`}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-4 py-3 transition-colors",
                        module.completed
                          ? "border-success/30 bg-success/5"
                          : "border-border hover:border-accent/40",
                      )}
                    >
                      {content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 text-xs text-foreground-muted">
            {dict.onboarding.step3Progress
              .replace("{done}", String(step3Progress.done))
              .replace("{total}", String(step3Progress.total))}
          </p>

          {state.step3Complete && (
            <Link
              href={`/${lang}/calendar/mobile`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              {dict.onboarding.finish}
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
