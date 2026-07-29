import "server-only";

import type { PayrollEmployeeLine } from "@/lib/payroll/calculate";
import { CSV_LINE_BREAK, csvRow, fallbackEmployeeCode, formatDateForCsv, splitFullName } from "@/lib/payroll/csv-utils";

/**
 * Codes de gains par défaut Nethris — le gain « 1 » (Régulier) et le gain
 * « 43 » (Supplémentaire) sont les codes standards les plus répandus chez
 * les clients Nethris, mais **restent configurables par compagnie** (voir
 * Paie → Paramètres de compagnie → Gains et déductions).
 */
export const NETHRIS_EARNING_CODES = {
  REGULAR: "1",
  OVERTIME: "43",
} as const;

const NETHRIS_HEADERS = [
  "Matricule",
  "Nom",
  "Prenom",
  "Code_Gain",
  "Description_Gain",
  "Quantite_Heures",
  "Montant",
  "Date_Fin_Periode",
] as const;

/**
 * Format « Excel en colonnes » — une ligne par (employé, code de gain), tel
 * qu'attendu par l'outil Nethris « Importer les transactions » (Paie →
 * Outils). L'import Nethris se fait toujours semaine par semaine ; comme
 * `PayrollLineItem` agrège déjà la période complète (validée pour ne
 * contenir que des semaines CNESST entières), une période de 2 semaines
 * produit deux imports Nethris distincts — on inclut donc la date de fin de
 * période sur chaque ligne pour faciliter le rapprochement côté gérant.
 */
export function generateNethrisCsv(lines: PayrollEmployeeLine[], periodEndDate: Date): string {
  const rows: string[] = [NETHRIS_HEADERS.join(",")];
  const periodEndLabel = formatDateForCsv(periodEndDate);

  for (const line of lines) {
    const { firstName, lastName } = splitFullName(line.fullName);
    const matricule = line.payrollEmployeeCode ?? fallbackEmployeeCode(line.userId);

    if (line.regularHours > 0) {
      rows.push(
        csvRow([
          matricule,
          lastName,
          firstName,
          NETHRIS_EARNING_CODES.REGULAR,
          "Regulier",
          line.regularHours.toFixed(2),
          line.regularPay.toFixed(2),
          periodEndLabel,
        ]),
      );
    }

    if (line.overtimeHours > 0) {
      rows.push(
        csvRow([
          matricule,
          lastName,
          firstName,
          NETHRIS_EARNING_CODES.OVERTIME,
          "Supplementaire",
          line.overtimeHours.toFixed(2),
          line.overtimePay.toFixed(2),
          periodEndLabel,
        ]),
      );
    }

  }

  return rows.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
