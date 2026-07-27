"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { bootstrapRecruitIntegrationAction } from "@/lib/actions/hr-excellence";
import { getSessionUser } from "@/lib/auth/session";
import { encryptBankFields } from "@/lib/crypto/field-encryption";
import { refreshOnboardingStatus } from "@/lib/hr/onboarding";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";

export type HrOnboardingActionResult = { ok: true } | { ok: false; error: string };

const ONBOARDING_PATH = "/[lang]/onboarding";
const PUNCH_PATH = "/[lang]/pointeuse";
const CALENDAR_PATH = "/[lang]/calendar";

function revalidateOnboardingPaths() {
  revalidatePath(ONBOARDING_PATH, "page");
  revalidatePath(PUNCH_PATH, "page");
  revalidatePath(CALENDAR_PATH, "layout");
  revalidatePath("/[lang]/team", "page");
}

export async function saveEmergencyContactAction(input: {
  name: string;
  phone: string;
  sinLastFour?: string;
  bankInstitutionNumber?: string;
  bankTransitNumber?: string;
  bankAccountNumber?: string;
}): Promise<HrOnboardingActionResult> {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== "EMPLOYEE") return { ok: false, error: "unauthorized" };

    const name = input.name.trim();
    const phone = input.phone.trim();
    if (name.length < 2 || phone.length < 7) return { ok: false, error: "invalid_contact" };

    const sinLastFour = input.sinLastFour?.trim();
    if (sinLastFour && !/^\d{4}$/.test(sinLastFour)) {
      return { ok: false, error: "invalid_sin" };
    }

    const bankInstitution = input.bankInstitutionNumber?.trim() || null;
    const bankTransit = input.bankTransitNumber?.trim() || null;
    const bankAccount = input.bankAccountNumber?.trim() || null;

    if (bankInstitution && !/^\d{3}$/.test(bankInstitution)) {
      return { ok: false, error: "invalid_bank" };
    }
    if (bankTransit && !/^\d{5}$/.test(bankTransit)) {
      return { ok: false, error: "invalid_bank" };
    }
    if (bankAccount && !/^\d{7,12}$/.test(bankAccount)) {
      return { ok: false, error: "invalid_bank" };
    }

    const encryptedBank = encryptBankFields({
      bankInstitutionNumber: bankInstitution,
      bankTransitNumber: bankTransit,
      bankAccountNumber: bankAccount,
    });

    await prisma.employeeHrProfile.upsert({
      where: { userId: user.id },
      update: {
        emergencyContactName: name,
        emergencyContactPhone: phone,
        sinLastFour: sinLastFour || null,
        ...encryptedBank,
        onboardingStatus: "IN_PROGRESS",
      },
      create: {
        userId: user.id,
        emergencyContactName: name,
        emergencyContactPhone: phone,
        sinLastFour: sinLastFour || null,
        ...encryptedBank,
        onboardingStatus: "IN_PROGRESS",
      },
    });

    await refreshOnboardingStatus(user.id);
    revalidateOnboardingPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("hr-onboarding", error);
  }
}

export async function signEmployeeHandbookAction(
  signatureName: string,
): Promise<HrOnboardingActionResult> {
  const { signWorkplaceConventionAction } = await import("@/lib/actions/workplace-convention");
  return signWorkplaceConventionAction(signatureName);
}
