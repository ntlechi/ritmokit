import { parseTicketCode } from "@/lib/payments/interac-status";

export type DoorSearchRow = {
  enrollmentId: string;
  studentName: string;
  studentEmail: string;
  ticketCode: string | null;
};

export function isSocialEvent(style: string, title: string): boolean {
  return /soir[eé]e|soiree|practica|social|party|fiesta|milonga/i.test(`${style} ${title}`);
}

export function normalizeDoorQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Last 4 hex chars of an enrollment id — usable when the guest reads a short code. */
export function shortDoorCode(enrollmentId: string): string {
  return enrollmentId.replace(/-/g, "").slice(-4).toLowerCase();
}

export function rowMatchesDoorQuery(row: DoorSearchRow, query: string): boolean {
  const q = normalizeDoorQuery(query);
  if (q.length < 2) return false;

  const name = row.studentName.toLowerCase();
  const email = row.studentEmail.toLowerCase();
  const ticket = (row.ticketCode ?? "").toLowerCase();
  const parsed = parseTicketCode(query);
  if (parsed && parsed === row.enrollmentId) return true;
  if (name.includes(q) || email.includes(q)) return true;
  if (ticket && (ticket.includes(q) || q.includes(ticket))) return true;
  const compact = q.replace(/[^a-z0-9]/g, "");
  if (compact.length >= 4 && shortDoorCode(row.enrollmentId) === compact.slice(-4)) {
    return true;
  }
  return false;
}
