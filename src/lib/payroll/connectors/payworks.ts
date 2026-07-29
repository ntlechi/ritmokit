import "server-only";

import type { PayrollEmployeeLine } from "@/lib/payroll/calculate";
import { CSV_LINE_BREAK, csvRow, fallbackEmployeeCode, formatDateForCsv } from "@/lib/payroll/csv-utils";

/**
 * Codes de gains par défaut Payworks/Powerpay — REG/OT sont les libellés
 * standards ; confirm earning codes in Payworks « Custom Import » setup.
 */
export const PAYWORKS_EARNING_CODES = {
  REGULAR: "REG",
  OVERTIME: "OT",
} as const;

const PAYWORKS_HEADERS = [
  "EmployeeNumber",
  "EmployeeName",
  "EarningCode",
  "Hours",
  "Amount",
  "PayPeriodEndDate",
] as const;

/**
 * Format « Custom Import » Payworks/Powerpay — une colonne Hours et une
 * colonne Amount distinctes (un code de gain ne renseigne jamais les deux à
 * la fois, voir le guide d'import officiel), date au format ISO (YYYY-MM-DD).
 */
export function generatePayworksCsv(lines: PayrollEmployeeLine[], periodEndDate: Date): string {
  const rows: string[] = [PAYWORKS_HEADERS.join(",")];
  const periodEndLabel = formatDateForCsv(periodEndDate);

  for (const line of lines) {
    const employeeNumber = line.payrollEmployeeCode ?? fallbackEmployeeCode(line.userId);

    if (line.regularHours > 0) {
      rows.push(
        csvRow([
          employeeNumber,
          line.fullName,
          PAYWORKS_EARNING_CODES.REGULAR,
          line.regularHours.toFixed(2),
          "",
          periodEndLabel,
        ]),
      );
    }

    if (line.overtimeHours > 0) {
      rows.push(
        csvRow([
          employeeNumber,
          line.fullName,
          PAYWORKS_EARNING_CODES.OVERTIME,
          line.overtimeHours.toFixed(2),
          "",
          periodEndLabel,
        ]),
      );
    }

  }

  return rows.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
