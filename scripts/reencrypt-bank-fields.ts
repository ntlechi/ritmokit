/**
 * One-shot: re-encrypt legacy plaintext bank columns on EmployeeHrProfile.
 * Usage: npx tsx scripts/reencrypt-bank-fields.ts
 *
 * Requires MIROK_FIELD_ENCRYPTION_KEY (or uses the local-dev key when NODE_ENV≠production).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  encryptBankFields,
  isEncryptedField,
} from "../src/lib/crypto/field-encryption-core";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.employeeHrProfile.findMany({
    where: {
      OR: [
        { bankInstitutionNumber: { not: null } },
        { bankTransitNumber: { not: null } },
        { bankAccountNumber: { not: null } },
      ],
    },
    select: {
      userId: true,
      bankInstitutionNumber: true,
      bankTransitNumber: true,
      bankAccountNumber: true,
    },
  });

  let updated = 0;
  for (const row of rows) {
    const needs =
      (row.bankInstitutionNumber && !isEncryptedField(row.bankInstitutionNumber)) ||
      (row.bankTransitNumber && !isEncryptedField(row.bankTransitNumber)) ||
      (row.bankAccountNumber && !isEncryptedField(row.bankAccountNumber));
    if (!needs) continue;

    const encrypted = encryptBankFields({
      bankInstitutionNumber: row.bankInstitutionNumber,
      bankTransitNumber: row.bankTransitNumber,
      bankAccountNumber: row.bankAccountNumber,
    });

    await prisma.employeeHrProfile.update({
      where: { userId: row.userId },
      data: encrypted,
    });
    updated += 1;
  }

  console.log(`Re-encrypted bank fields for ${updated}/${rows.length} HR profile(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
