"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { bootstrapRecruitIntegrationAction } from "@/lib/actions/hr-excellence";
import type { DisciplineStep } from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/auth/session";
import { refreshOnboardingStatus } from "@/lib/hr/onboarding";
import { getOrCreateDirectConversation } from "@/lib/hr/buddy";
import {
  countPriorInfractions,
  getConventionLocationStats,
  previewDisciplineStep,
} from "@/lib/data/workplace-convention";
import { prisma } from "@/lib/prisma";
import { actionDatabaseError } from "@/lib/actions/result";
import {
  CONVENTION_REMINDER_COOLDOWN_HOURS,
  conventionReminderAnnouncementBody,
  conventionReminderDmBody,
} from "@/lib/policy/convention-reminders";
import {
  getInfractionDefinition,
  getManagerScript,
  stepRequiresEmployeeSignature,
  WORKPLACE_CONVENTION_VERSION,
  type WorkplaceInfractionCode,
} from "@/lib/policy/workplace-convention";
import type { Locale } from "@/lib/i18n/config";

export type ConventionActionResult = { ok: true } | { ok: false; error: string };

const CONVENTION_PATH = "/[lang]/convention";
const ONBOARDING_PATH = "/[lang]/onboarding";
const MANAGER_PATH = "/[lang]/settings/manager/convention";

const DASHBOARD_PATH = "/[lang]/dashboard";
const MESSAGES_PATH = "/[lang]/messages";

function revalidateConventionPaths() {
  revalidatePath(CONVENTION_PATH, "page");
  revalidatePath(ONBOARDING_PATH, "page");
  revalidatePath(MANAGER_PATH, "page");
  revalidatePath(DASHBOARD_PATH, "page");
  revalidatePath("/[lang]/settings", "page");
  revalidatePath("/[lang]/team", "page");
  revalidatePath(MESSAGES_PATH, "layout");
}

function resolveAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://ritmokit.com";
}

function profileLocaleToUi(locale: "FR" | "EN" | "ES" | undefined, fallback: Locale): Locale {
  if (locale === "EN") return "en";
  if (locale === "ES") return "es";
  if (locale === "FR") return "fr";
  return fallback;
}

async function hasRecentConventionReminderBatch(managerId: string, locationId: string) {
  const since = new Date();
  since.setHours(since.getHours() - CONVENTION_REMINDER_COOLDOWN_HOURS);

  const recent = await prisma.chatMessage.findFirst({
    where: {
      authorId: managerId,
      createdAt: { gte: since },
      AND: [
        { metadata: { path: ["intent"], equals: "convention_reminder_batch" } },
        { metadata: { path: ["locationId"], equals: locationId } },
      ],
    },
    select: { id: true },
  });

  return Boolean(recent);
}

async function resolveClientIp() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? headerStore.get("x-real-ip") ?? null;
}

export async function signWorkplaceConventionAction(
  signatureName: string,
  employeeComment?: string,
): Promise<ConventionActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const trimmedSignature = signatureName.trim();
    if (trimmedSignature.length < 2) return { ok: false, error: "invalid_signature" };

    const existing = await prisma.workplaceConventionSignature.findUnique({
      where: {
        userId_version: { userId: user.id, version: WORKPLACE_CONVENTION_VERSION },
      },
    });
    if (existing) return { ok: false, error: "already_signed" };

    if (user.role === "EMPLOYEE") {
      const hrProfile = await prisma.employeeHrProfile.findUnique({ where: { userId: user.id } });
      if (!hrProfile?.emergencyContactName || !hrProfile.emergencyContactPhone) {
        return { ok: false, error: "step1_required" };
      }
    }

    const ipAddress = await resolveClientIp();
    const now = new Date();

    await prisma.$transaction([
      prisma.workplaceConventionSignature.create({
        data: {
          userId: user.id,
          version: WORKPLACE_CONVENTION_VERSION,
          signatureName: trimmedSignature,
          signedAt: now,
          ipAddress,
          employeeComment: employeeComment?.trim() || null,
        },
      }),
      prisma.employeeHrProfile.upsert({
        where: { userId: user.id },
        update: {
          hasSignedHandbook: true,
          handbookSignatureName: trimmedSignature,
          handbookSignedAt: now,
          handbookIpAddress: ipAddress,
        },
        create: {
          userId: user.id,
          hasSignedHandbook: true,
          handbookSignatureName: trimmedSignature,
          handbookSignedAt: now,
          handbookIpAddress: ipAddress,
          onboardingStatus: "IN_PROGRESS",
        },
      }),
    ]);

    if (user.role === "EMPLOYEE") {
      await refreshOnboardingStatus(user.id);

      const membership = await prisma.locationMember.findFirst({
        where: { userId: user.id, isPrimary: true },
        select: { locationId: true, stationId: true },
      });
      if (membership) {
        await bootstrapRecruitIntegrationAction({
          locationId: membership.locationId,
          recruitUserId: user.id,
          stationId: membership.stationId,
        });
      }
    }

    revalidateConventionPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("workplace-convention", error);
  }
}

export async function logDisciplinaryAction(input: {
  employeeId: string;
  infractionCode: WorkplaceInfractionCode;
  facts: string;
  managerNotes?: string;
  occurredAt?: string;
  lang: Locale;
}): Promise<ConventionActionResult & { recordId?: string; step?: DisciplineStep }> {
  try {
    const user = await getSessionUser();
    if (!user || (user.role !== "MANAGER" && user.role !== "OWNER" && user.role !== "ADMIN")) {
      return { ok: false, error: "unauthorized" };
    }

    const facts = input.facts.trim();
    if (facts.length < 10) return { ok: false, error: "facts_too_short" };

    const membership = await prisma.locationMember.findFirst({
      where: { userId: user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    if (!membership) return { ok: false, error: "no_location" };

    const employeeMember = await prisma.locationMember.findUnique({
      where: {
        locationId_userId: { locationId: membership.locationId, userId: input.employeeId },
      },
      include: { user: { select: { fullName: true, role: true } } },
    });
    if (!employeeMember || employeeMember.user.role !== "EMPLOYEE") {
      return { ok: false, error: "employee_not_found" };
    }

    const def = getInfractionDefinition(input.infractionCode);
    const priorCount = await countPriorInfractions(input.employeeId, input.infractionCode);
    const step = await previewDisciplineStep(input.employeeId, input.infractionCode);
    const script = getManagerScript(input.infractionCode, input.lang, Math.min(priorCount, 1));
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

    const record = await prisma.disciplinaryRecord.create({
      data: {
        locationId: membership.locationId,
        employeeId: input.employeeId,
        managerId: user.id,
        infractionCode: input.infractionCode,
        disciplineStep: step,
        cultureValueKey: def.cultureValueKey,
        facts,
        managerNotes: input.managerNotes?.trim() || null,
        managerScript: script,
        occurredAt,
        requiresEmployeeSignature: stepRequiresEmployeeSignature(step),
      },
    });

    revalidateConventionPaths();
    return { ok: true, recordId: record.id, step };
  } catch (error) {
    return actionDatabaseError("workplace-convention", error);
  }
}

export async function signDisciplinaryRecordAction(
  recordId: string,
  signatureName: string,
  employeeComment?: string,
): Promise<ConventionActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const trimmedSignature = signatureName.trim();
    if (trimmedSignature.length < 2) return { ok: false, error: "invalid_signature" };

    const record = await prisma.disciplinaryRecord.findUnique({ where: { id: recordId } });
    if (!record || record.employeeId !== user.id) return { ok: false, error: "not_found" };
    if (!record.requiresEmployeeSignature) return { ok: false, error: "signature_not_required" };
    if (record.employeeSignedAt) return { ok: false, error: "already_signed" };

    const ipAddress = await resolveClientIp();

    await prisma.disciplinaryRecord.update({
      where: { id: recordId },
      data: {
        employeeSignatureName: trimmedSignature,
        employeeSignedAt: new Date(),
        employeeSignatureIp: ipAddress,
        employeeComment: employeeComment?.trim() || record.employeeComment,
      },
    });

    revalidateConventionPaths();
    return { ok: true };
  } catch (error) {
    return actionDatabaseError("workplace-convention", error);
  }
}

export type ConventionReminderResult =
  | { ok: true; dmCount: number; announced: boolean }
  | { ok: false; error: string };

/** Envoie un rappel in-app (DM + canal Annonces) aux employés sans signature. */
export async function sendConventionRemindersAction(lang: Locale): Promise<ConventionReminderResult> {
  try {
    const user = await getSessionUser();
    if (!user || (user.role !== "MANAGER" && user.role !== "OWNER" && user.role !== "ADMIN")) {
      return { ok: false, error: "unauthorized" };
    }

    const membership = await prisma.locationMember.findFirst({
      where: { userId: user.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { locationId: true },
    });
    if (!membership) return { ok: false, error: "no_location" };

    const stats = await getConventionLocationStats(membership.locationId);
    if (stats.pendingCount === 0) return { ok: false, error: "all_signed" };

    if (await hasRecentConventionReminderBatch(user.id, membership.locationId)) {
      return { ok: false, error: "cooldown" };
    }

    const pendingMembers = await prisma.locationMember.findMany({
      where: {
        locationId: membership.locationId,
        userId: { in: stats.pendingUserIds },
      },
      include: {
        user: {
          select: {
            id: true,
            employeeProfile: { select: { preferredLanguage: true } },
          },
        },
      },
    });

    const appUrl = resolveAppUrl();
    let dmCount = 0;

    for (const member of pendingMembers) {
      const employeeLang = profileLocaleToUi(
        member.user.employeeProfile?.preferredLanguage,
        lang,
      );
      const conversationId = await getOrCreateDirectConversation({
        locationId: membership.locationId,
        userIdA: user.id,
        userIdB: member.user.id,
      });

      await prisma.chatMessage.create({
        data: {
          conversationId,
          authorId: user.id,
          contentType: "AGENT",
          body: conventionReminderDmBody(employeeLang, appUrl),
          metadata: {
            intent: "convention_reminder_dm",
            locationId: membership.locationId,
            version: WORKPLACE_CONVENTION_VERSION,
            targetUserId: member.user.id,
          },
        },
      });

      await prisma.directConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      dmCount += 1;
    }

    const announcements = await prisma.chatChannel.findUnique({
      where: { locationId_slug: { locationId: membership.locationId, slug: "annonces" } },
      select: { id: true },
    });

    let announced = false;
    if (announcements) {
      await prisma.chatMessage.create({
        data: {
          channelId: announcements.id,
          authorId: user.id,
          contentType: "AGENT",
          body: conventionReminderAnnouncementBody(lang, stats.pendingCount, stats.version),
          metadata: {
            intent: "convention_reminder_batch",
            locationId: membership.locationId,
            version: WORKPLACE_CONVENTION_VERSION,
            pendingCount: stats.pendingCount,
            dmCount,
          },
        },
      });
      announced = true;
    } else {
      const management = await prisma.chatChannel.findUnique({
        where: { locationId_slug: { locationId: membership.locationId, slug: "gestion" } },
        select: { id: true },
      });
      if (management) {
        await prisma.chatMessage.create({
          data: {
            channelId: management.id,
            authorId: user.id,
            contentType: "AGENT",
            body: `📋 Convention v${stats.version} — rappels envoyés à ${dmCount} employé(s).`,
            metadata: {
              intent: "convention_reminder_batch",
              locationId: membership.locationId,
              version: WORKPLACE_CONVENTION_VERSION,
              pendingCount: stats.pendingCount,
              dmCount,
            },
          },
        });
        announced = true;
      }
    }

    revalidateConventionPaths();
    revalidatePath(`/${lang}/messages`, "layout");
    return { ok: true, dmCount, announced };
  } catch (error) {
    return actionDatabaseError("workplace-convention", error);
  }
}

/** @deprecated Use signWorkplaceConventionAction — kept for onboarding wizard compat. */
export async function signEmployeeHandbookAction(signatureName: string): Promise<ConventionActionResult> {
  return signWorkplaceConventionAction(signatureName);
}
