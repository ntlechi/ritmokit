import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** Local-dev fallback only — production refuses to start without PUNCH_PIN_PEPPER. */
const DEV_PEPPER_FALLBACK = "mirok-punch-pin-v1";

function getPunchPinPepper(): string {
  const pepper = process.env.PUNCH_PIN_PEPPER?.trim();
  if (pepper) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PUNCH_PIN_PEPPER is required in production");
  }
  return DEV_PEPPER_FALLBACK;
}

/** scrypt params — adequate for 4-digit PIN + per-user salt + pepper on Vercel Node. */
const SCRYPT_KEYLEN = 32;
const SCRYPT_OPTS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} as const;

export function createPunchPinSalt(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Derive a punch-PIN hash with per-user salt + env pepper.
 * Lookup must verify candidates (inverted path) — never index by this hash alone.
 */
export function hashPunchPin(pin: string, salt: string): string {
  return scryptSync(
    `${getPunchPinPepper()}:${pin}`,
    salt,
    SCRYPT_KEYLEN,
    SCRYPT_OPTS,
  ).toString("hex");
}

export function createPunchPinCredentials(pin: string): { salt: string; hash: string } {
  const salt = createPunchPinSalt();
  return { salt, hash: hashPunchPin(pin, salt) };
}

/** Hot path for kiosk — compare against a stored salt+hash pair. */
export function verifyPunchPin(
  pin: string,
  salt: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (!salt || !storedHash) return false;
  try {
    const computed = Buffer.from(hashPunchPin(pin, salt), "hex");
    const expected = Buffer.from(storedHash, "hex");
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

export function isValidPunchPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** Trivial PINs rejected at enrollment (0000, 1234, repeated, sequential). */
export function isWeakPunchPin(pin: string): boolean {
  if (!isValidPunchPin(pin)) return true;

  if (/^(\d)\1{3}$/.test(pin)) return true;

  const weakExact = new Set([
    "0000",
    "1111",
    "2222",
    "3333",
    "4444",
    "5555",
    "6666",
    "7777",
    "8888",
    "9999",
    "0123",
    "1234",
    "2345",
    "3456",
    "4567",
    "5678",
    "6789",
    "9876",
    "8765",
    "7654",
    "6543",
    "5432",
    "4321",
    "3210",
  ]);
  if (weakExact.has(pin)) return true;

  const digits = pin.split("").map(Number);
  const asc =
    digits[1] === digits[0] + 1 &&
    digits[2] === digits[1] + 1 &&
    digits[3] === digits[2] + 1;
  const desc =
    digits[1] === digits[0] - 1 &&
    digits[2] === digits[1] - 1 &&
    digits[3] === digits[2] - 1;
  return asc || desc;
}
