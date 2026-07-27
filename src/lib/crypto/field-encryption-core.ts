import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * AES-256-GCM field encryption for sensitive HR columns (bank routing/account).
 * Wire format: `enc:v1:<iv_b64url>.<tag_b64url>.<ciphertext_b64url>`
 * Legacy plaintext (no prefix) is still readable via decryptField for migration.
 */

const PREFIX = "enc:v1:";
const DEV_KEY_MATERIAL = "ritmokit-dev-field-encryption-v1";

function resolveKey(): Buffer {
  const secret =
    process.env.RITMOKIT_FIELD_ENCRYPTION_KEY?.trim() ||
    process.env.MIROK_FIELD_ENCRYPTION_KEY?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RITMOKIT_FIELD_ENCRYPTION_KEY is required in production");
    }
    return scryptSync(DEV_KEY_MATERIAL, "ritmokit-field-salt", 32);
  }

  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }

  const asB64 = Buffer.from(secret, "base64");
  if (asB64.length === 32) return asB64;

  throw new Error(
    "RITMOKIT_FIELD_ENCRYPTION_KEY must be 32 bytes (64 hex chars or standard base64)",
  );
}

export function isEncryptedField(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PREFIX));
}

export function encryptField(plaintext: string | null | undefined): string | null {
  const value = plaintext?.trim();
  if (!value) return null;

  if (isEncryptedField(value)) return value;

  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncryptedField(stored)) {
    return stored;
  }

  const payload = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("invalid_encrypted_field");
  }

  const key = resolveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export type BankFieldTriplet = {
  bankInstitutionNumber: string | null;
  bankTransitNumber: string | null;
  bankAccountNumber: string | null;
};

export function encryptBankFields(input: {
  bankInstitutionNumber?: string | null;
  bankTransitNumber?: string | null;
  bankAccountNumber?: string | null;
}): BankFieldTriplet {
  return {
    bankInstitutionNumber: encryptField(input.bankInstitutionNumber),
    bankTransitNumber: encryptField(input.bankTransitNumber),
    bankAccountNumber: encryptField(input.bankAccountNumber),
  };
}

export function decryptBankFields(stored: BankFieldTriplet): BankFieldTriplet {
  return {
    bankInstitutionNumber: decryptField(stored.bankInstitutionNumber),
    bankTransitNumber: decryptField(stored.bankTransitNumber),
    bankAccountNumber: decryptField(stored.bankAccountNumber),
  };
}
