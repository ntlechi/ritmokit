import type { Locale } from "@/lib/i18n/config";
import { WORKPLACE_CONVENTION_VERSION } from "@/lib/policy/workplace-convention";

export function conventionReminderDmBody(lang: Locale, appUrl: string): string {
  const link = `${appUrl.replace(/\/$/, "")}/${lang}/convention`;
  if (lang === "en") {
    return `📋 Mirok reminder — Workplace Convention v${WORKPLACE_CONVENTION_VERSION} needs your signature before your next shift.\n\nSign here: ${link}`;
  }
  if (lang === "es") {
    return `📋 Recordatorio Mirok — La Convención de trabajo v${WORKPLACE_CONVENTION_VERSION} requiere tu firma antes de tu próximo turno.\n\nFirma aquí: ${link}`;
  }
  return `📋 Rappel Mirok — La Convention de travail v${WORKPLACE_CONVENTION_VERSION} attend ta signature avant ton prochain quart.\n\nSigner ici : ${link}`;
}

export function conventionReminderAnnouncementBody(
  lang: Locale,
  pendingCount: number,
  version: string,
): string {
  if (lang === "en") {
    return `📋 Workplace Convention v${version} — ${pendingCount} teammate(s) still need to sign. Open Mirok → Settings → Workplace convention.`;
  }
  if (lang === "es") {
    return `📋 Convención de trabajo v${version} — ${pendingCount} compañero(s) aún deben firmar. Abre Mirok → Ajustes → Convención de trabajo.`;
  }
  return `📋 Convention de travail v${version} — ${pendingCount} employé(s) n'ont pas encore signé. Ouvre Mirok → Réglages → Convention de travail.`;
}

export const CONVENTION_REMINDER_COOLDOWN_HOURS = 12;
