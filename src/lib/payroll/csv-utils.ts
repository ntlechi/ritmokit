import "server-only";

/** CRLF est attendu par la plupart des outils d'import Windows (Nethris, Payworks). */
export const CSV_LINE_BREAK = "\r\n";

export function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function csvRow(values: Array<string | number>): string {
  return values.map(csvEscape).join(",");
}

/** "Jean-Philippe Tremblay" → { firstName: "Jean-Philippe", lastName: "Tremblay" } —
 * heuristique simple (premier mot = prénom) faute d'un champ prénom/nom distinct
 * sur `User`. Les systèmes de paie québécois exigent presque tous les deux. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Repli si le gérant n'a pas encore renseigné le matricule externe
 * (`EmployeeHrProfile.payrollEmployeeCode`) — reste stable pour un même
 * employé d'un export à l'autre. */
export function fallbackEmployeeCode(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function formatDateForCsv(date: Date): string {
  return date.toISOString().slice(0, 10);
}
