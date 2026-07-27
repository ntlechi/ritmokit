import "server-only";

/** Coerce Prisma Decimal (or numeric string) to a plain number for RSC → client props. */
export function asPlainNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}
